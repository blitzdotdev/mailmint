// Ported from cf-mailroom (Apache-2.0), src/worker/api/access.ts.
import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, decodeJwt, errors, jwtVerify } from "jose";

export interface WebAccessEnv {
  WEB_ACCESS_TEAM_DOMAIN?: string;
  WEB_ACCESS_AUD?: string;
}

export interface AccessIdentity {
  email: string;
  sub: string;
}

/**
 * Machine-readable reasons the web app uses to show its setup guide:
 * - `access_not_configured`: WEB_ACCESS_* variables are missing or invalid.
 * - `access_missing`: no Access assertion, so Access is not in front of this Worker.
 * - `access_invalid`: the assertion does not match the configured application.
 */
export type AccessFailureCode =
  | "access_not_configured"
  | "access_missing"
  | "access_invalid"
  | "access_forbidden"
  | "access_unavailable";

/** Unverified issuer/audience from the request's own assertion, shown to help setup. */
export interface AccessHint {
  team_domain: string;
  aud: string;
}

export type AccessResult =
  | { ok: true; identity: AccessIdentity }
  | { ok: false; status: 401 | 403 | 503; code: AccessFailureCode; error: string; hint?: AccessHint };

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/** Verify Access's signed assertion, even if a public route misses edge protection. */
export async function verifyWebAccess(
  token: string | null | undefined,
  env: WebAccessEnv,
): Promise<AccessResult> {
  const issuer = accessIssuer(env.WEB_ACCESS_TEAM_DOMAIN);
  const audience = env.WEB_ACCESS_AUD?.trim();
  if (!issuer || !audience) {
    return failure(503, "access_not_configured", "Web authentication is not configured", token);
  }
  if (!token) return failure(401, "access_missing", "Authentication required");

  let jwks = keySets.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    keySets.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer,
      audience,
      algorithms: ["RS256"],
      requiredClaims: ["exp", "sub", "email", "type"],
    });
    if (
      payload.type !== "app" ||
      typeof payload.sub !== "string" || !payload.sub.trim() ||
      typeof payload.email !== "string" || !payload.email.trim()
    ) {
      return failure(403, "access_forbidden", "An Access user identity is required");
    }
    return { ok: true, identity: { email: payload.email, sub: payload.sub } };
  } catch (error) {
    if (error instanceof TypeError || error instanceof errors.JWKSTimeout ||
        (error instanceof errors.JOSEError && error.code === "ERR_JOSE_GENERIC")) {
      return failure(503, "access_unavailable", "Authentication service unavailable");
    }
    return failure(401, "access_invalid", "Invalid or expired Access assertion", token);
  }
}

export interface DevAccessEnv extends WebAccessEnv {
  DEV_BYPASS_ACCESS?: string;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|[a-z0-9.-]+\.localhost)(:\d+)?$/;

/**
 * Verify Access, or in local dev (DEV_BYPASS_ACCESS=1 in .dev.vars) accept a
 * request whose Host is local. The bypass is ignored on any other host.
 *
 * Under `wrangler dev --local-upstream`, miniflare rewrites request.url to the
 * upstream host and passes the Host the client actually used in
 * MF-Original-Hostname; both must be local, so a LAN client hitting a dev
 * server bound to 0.0.0.0 by IP doesn't get owner access.
 */
export async function verifyAccessRequest(request: Request, env: DevAccessEnv): Promise<AccessResult> {
  const host = new URL(request.url).host;
  const original = request.headers.get("MF-Original-Hostname");
  if (env.DEV_BYPASS_ACCESS === "1" && LOCAL_HOST.test(host) && (original === null || LOCAL_HOST.test(original))) {
    return { ok: true, identity: { email: "dev@localhost", sub: "dev" } };
  }
  return verifyWebAccess(request.headers.get("Cf-Access-Jwt-Assertion"), env);
}

export const requireWebAccess: MiddlewareHandler<{ Bindings: DevAccessEnv; Variables: { identity: AccessIdentity } }> = async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  const result = await verifyAccessRequest(c.req.raw, c.env);
  if (!result.ok) {
    const { status, code, error } = result;
    return c.html(
      `<!doctype html><meta charset="utf-8"><title>Sign-in required</title><body style="font-family:system-ui;max-width:560px;margin:60px auto;padding:0 20px"><h1>Sign-in required</h1><p>${error} (<code>${code}</code>).</p><p>This page is protected by Cloudflare Access. If you are the owner, check the Access application for this path and the <code>WEB_ACCESS_*</code> vars.</p></body>`,
      status,
    );
  }
  c.set("identity", result.identity);
  await next();
};

function failure(
  status: 401 | 403 | 503,
  code: AccessFailureCode,
  error: string,
  token?: string | null,
): AccessResult {
  const hint = token ? accessHint(token) : undefined;
  return { ok: false, status, code, error, ...(hint ? { hint } : {}) };
}

function accessHint(token: string): AccessHint | undefined {
  try {
    const { iss, aud } = decodeJwt(token);
    const teamDomain = accessIssuer(iss);
    const audience = Array.isArray(aud) ? aud[0] : aud;
    if (!teamDomain || typeof audience !== "string" || !/^[a-f0-9]{64}$/.test(audience)) {
      return undefined;
    }
    return { team_domain: teamDomain, aud: audience };
  } catch {
    return undefined;
  }
}

function accessIssuer(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(url.hostname) ||
      url.port || url.username || url.password || url.search || url.hash ||
      url.pathname !== "/"
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}
