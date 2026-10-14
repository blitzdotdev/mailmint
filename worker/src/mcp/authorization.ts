// Adapted from cf-mailroom (Apache-2.0), src/mcp/authorization.ts.
import {
  AuthorizationError,
  type AuthRequest,
  type ClientInfo,
  type OAuthHelpers,
} from "@cloudflare/workers-oauth-provider";
import { verifyAccessRequest, type DevAccessEnv } from "../api/access.ts";
import {
  MCP_READ_SCOPE,
  MCP_SCOPES,
  MCP_MANAGE_SCOPE,
  type OAuthGrantProps,
} from "./auth-types.ts";
import {
  AuthorizationSubmissionError,
  consumeAuthorizationTransaction,
  createAuthorizationTransaction,
  parseAuthorizationSubmission,
} from "./authorization-security.ts";

export interface AuthorizationEnv extends DevAccessEnv {
  DB: D1Database;
  OAUTH_PROVIDER: OAuthHelpers;
}

const MAX_FORM_BYTES = 4096;

export const authorizationHandler: ExportedHandler<AuthorizationEnv> = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/authorize") {
      return new Response("Not found", { status: 404 });
    }
    if (request.method !== "GET" && request.method !== "POST") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { Allow: "GET, POST" },
      });
    }

    // /authorize is covered by the same Access application as the web app.
    const access = await verifyAccessRequest(request, env);
    if (!access.ok) {
      return htmlPage("Authorization unavailable", `<p>${escapeHtml(access.error)}</p>`, access.status);
    }
    const { identity } = access;

    let oauthRequest: AuthRequest;
    try {
      oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
    } catch (error) {
      if (!(error instanceof AuthorizationError)) throw error;
      return authorizationError(error);
    }

    const client = await env.OAUTH_PROVIDER.lookupClient(oauthRequest.clientId);
    if (!client) {
      return htmlPage("Unknown client", "<p>This OAuth client is not registered.</p>", 400);
    }

    if (request.method === "GET") {
      let transactionToken: string;
      try {
        transactionToken = await createAuthorizationTransaction(
          env.DB,
          identity.sub,
          oauthRequest,
        );
      } catch (error) {
        return authorizationTransactionFailure("create", error);
      }
      return consentPage(oauthRequest, client, identity.email, transactionToken);
    }

    const expectedOrigin = url.origin;
    let submission: Awaited<ReturnType<typeof parseAuthorizationSubmission>>;
    try {
      submission = await parseAuthorizationSubmission(request, {
        expectedOrigin,
        maxBodyBytes: MAX_FORM_BYTES,
      });
    } catch (error) {
      if (!(error instanceof AuthorizationSubmissionError)) throw error;
      if (error.code === "invalid_transaction") {
        return htmlPage(
          "Authorization expired",
          "<p>Return to your MCP client and start the connection again.</p>",
          error.status,
        );
      }
      const message = error.code === "body_too_large"
        ? "The submitted form is too large."
        : error.code === "invalid_source"
        ? "The request origin is invalid."
        : "The submitted form is invalid.";
      return htmlPage("Authorization rejected", `<p>${message}</p>`, error.status);
    }

    let consumed: boolean;
    try {
      consumed = await consumeAuthorizationTransaction(
        env.DB,
        submission.transactionToken,
        identity.sub,
        oauthRequest,
      );
    } catch (error) {
      return authorizationTransactionFailure("consume", error);
    }
    if (!consumed) {
      return htmlPage(
        "Authorization expired",
        "<p>Return to your MCP client and start the connection again.</p>",
        400,
      );
    }

    const { form } = submission;
    if (form.get("decision") !== "approve") {
      return oauthRedirect(oauthRequest, {
        error: "access_denied",
        errorDescription: "The resource owner denied the authorization request",
      });
    }

    const requestedScopes = oauthRequest.scope.length > 0
      ? oauthRequest.scope
      : [MCP_READ_SCOPE];
    const grantedScopes = requestedScopes.filter((scope) =>
      (MCP_SCOPES as readonly string[]).includes(scope)
    );
    if (!grantedScopes.includes(MCP_READ_SCOPE)) {
      return oauthRedirect(oauthRequest, {
        error: "invalid_scope",
        errorDescription: `The ${MCP_READ_SCOPE} scope is required`,
      });
    }

    const props: OAuthGrantProps = {
      email: identity.email,
      sub: identity.sub,
      clientId: oauthRequest.clientId,
      scopes: grantedScopes,
    };
    try {
      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthRequest,
        userId: identity.sub,
        metadata: {
          ownerEmail: identity.email,
          clientName: client.clientName ?? client.clientId,
        },
        scope: grantedScopes,
        props,
      });
      return redirectResponse(redirectTo);
    } catch (error) {
      const correlationId = crypto.randomUUID();
      console.error("MCP OAuth authorization failed", {
        correlationId,
        errorType: error instanceof Error ? error.name : "unknown",
      });
      return oauthRedirect(oauthRequest, {
        error: "server_error",
        errorDescription: `Authorization could not be completed (${correlationId})`,
      });
    }
  },
};

function consentPage(
  request: AuthRequest,
  client: ClientInfo,
  ownerEmail: string,
  transactionToken: string,
): Response {
  const requested = new Set(request.scope.length > 0 ? request.scope : [MCP_READ_SCOPE]);
  const permissions = [
    requested.has(MCP_READ_SCOPE)
      ? "<li><strong>Read mail</strong><span>List inboxes, read messages, and wait for new mail.</span></li>"
      : "",
    requested.has(MCP_MANAGE_SCOPE)
      ? "<li><strong>Manage inboxes</strong><span>Create and delete inboxes.</span></li>"
      : "",
  ].join("");
  const clientName = client.clientName?.trim() || "An MCP client";

  return htmlPage(
    "Authorize mailmint",
    `<header>
      <svg class="mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="3.5" width="22" height="17" rx="5" fill="currentColor"/><path d="M5 8.2 12 13l7-4.8" fill="none" stroke="var(--card)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18.6" cy="16.2" r="2.4" fill="var(--mint)"/></svg>
      <div><h1>Authorize ${escapeHtml(clientName)}</h1><p>Connect this client to mailmint.</p></div>
    </header>
    <section class="client">
      <span>Signed in as</span><strong>${escapeHtml(ownerEmail)}</strong>
      <span>Client ID</span><strong>${escapeHtml(shortClientId(client.clientId))}</strong>
      <span>Return to</span><strong>${escapeHtml(safeUrlLabel(request.redirectUri))}</strong>
    </section>
    <h2>Requested access</h2>
    <ul>${permissions || "<li><strong>No supported permissions</strong></li>"}</ul>
    <p class="notice">Email content is untrusted external input. Only authorize clients you recognize.</p>
    <form method="post">
      <input type="hidden" name="authorization_transaction" value="${escapeHtml(transactionToken)}">
      <button class="secondary" type="submit" name="decision" value="deny">Cancel</button>
      <button type="submit" name="decision" value="approve">Authorize</button>
    </form>`,
    200,
  );
}

function authorizationTransactionFailure(operation: "create" | "consume", error: unknown): Response {
  const correlationId = crypto.randomUUID();
  console.error("MCP OAuth consent transaction failed", {
    correlationId,
    operation,
    errorType: error instanceof Error ? error.name : "unknown",
  });
  return htmlPage(
    "Authorization unavailable",
    `<p>Try the connection again shortly. (${escapeHtml(correlationId)})</p>`,
    503,
  );
}

function authorizationError(error: AuthorizationError): Response {
  if (!error.redirectUri) {
    return htmlPage(
      "Invalid authorization request",
      `<p>${escapeHtml(error.description)}</p>`,
      400,
    );
  }
  const redirect = new URL(error.redirectUri);
  redirect.searchParams.set("error", error.code);
  redirect.searchParams.set("error_description", error.description);
  if (error.state) redirect.searchParams.set("state", error.state);
  if (error.issuer) redirect.searchParams.set("iss", error.issuer);
  return redirectResponse(redirect.toString());
}

function oauthRedirect(
  request: AuthRequest,
  result: { error: string; errorDescription: string },
): Response {
  const redirect = new URL(request.redirectUri);
  redirect.searchParams.set("error", result.error);
  redirect.searchParams.set("error_description", result.errorDescription);
  if (request.state) redirect.searchParams.set("state", request.state);
  if (request.issuer) redirect.searchParams.set("iss", request.issuer);
  return redirectResponse(redirect.toString());
}

function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: location,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function htmlPage(
  title: string,
  body: string,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>
@font-face{font-family:Geist;src:url(/assets/fonts/geist.woff2) format("woff2");font-weight:100 900;font-display:swap}
:root{--bg:oklch(0.984 0.002 265);--card:#fff;--fg:oklch(0.2 0.012 265);--muted:oklch(0.51 0.017 265);--border:oklch(0.918 0.005 265);--input:oklch(0.89 0.007 265);--primary:oklch(0.22 0.014 265);--mint:#0d9373;font-family:Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--fg);background:var(--bg);-webkit-font-smoothing:antialiased;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:oklch(0.17 0 0);--card:oklch(0.205 0 0);--fg:oklch(0.985 0 0);--muted:oklch(0.708 0 0);--border:oklch(1 0 0/10%);--input:oklch(1 0 0/15%);--primary:oklch(0.922 0 0);--mint:#34c39b;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-size:14px}.card{width:min(480px,100%);background:var(--card);border-radius:14px;padding:24px;box-shadow:0 0 0 1px var(--border),0 4px 16px -6px oklch(0.2 0.012 265/0.1)}header{display:flex;gap:12px;align-items:center;margin-bottom:20px}.mark{width:36px;height:36px;flex-shrink:0;color:var(--fg)}h1{font-size:17px;line-height:1.3;margin:0 0 2px;font-weight:600;letter-spacing:-.015em}h2{font-size:13px;font-weight:600;margin:20px 0 8px}p{margin:0;color:var(--muted);line-height:1.5}.client{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;padding:12px 0;border-block:1px solid var(--border);font-size:13px}.client span{color:var(--muted)}.client strong{font-weight:500;overflow-wrap:anywhere}ul{list-style:none;padding:0;margin:0;border:1px solid var(--border);border-radius:10px}li{display:flex;flex-direction:column;gap:2px;padding:11px 13px}li+li{border-top:1px solid var(--border)}li strong{font-weight:500}li span{color:var(--muted);font-size:13px}.notice{font-size:12.5px;margin-top:12px}form{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}button{height:34px;border:1px solid transparent;border-radius:8px;background:var(--primary);color:var(--card);padding:0 14px;font:inherit;font-size:13px;font-weight:500;cursor:pointer}.secondary{background:var(--card);color:var(--fg);border-color:var(--border)}button:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in oklch,var(--muted) 40%,transparent)}
</style></head><body><main class="card">${body}</main></body></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      Pragma: "no-cache",
      // Do not set form-action here. Browsers apply it to the full form
      // navigation redirect chain, which would block the OAuth provider's
      // already-validated cross-origin client callback after approval.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; img-src 'none'; script-src 'none'",
      "Referrer-Policy": "strict-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      ...extraHeaders,
    },
  });
}

function safeUrlLabel(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

function shortClientId(value: string): string {
  if (value.length <= 72) return value;
  return `${value.slice(0, 36)}…${value.slice(-28)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
