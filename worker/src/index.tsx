import { Hono, type Context } from "hono";
import { ApiError, errorBody } from "./lib/errors.ts";
import { capability, v1 } from "./api/rest.ts";
import type { Principal } from "./api/auth.ts";
import { receiveEmail } from "./email/receive.ts";
import type { Env } from "./env.ts";
import { config } from "./lib/config.ts";
import { withMcp } from "./mcp/index.ts";
import { purge } from "./purge.ts";
import { getMessage, listMessages } from "./store/messages.ts";
import { admin } from "./ui/admin.tsx";
import { inboxAgentsMd, serviceAgentsMd } from "./ui/docs.ts";
import { CSS, JS, PAGE_HEADERS } from "./ui/layout.tsx";
import { CapabilityPage, LandingPage } from "./ui/views.tsx";

export { InboxSignal } from "./signal.ts";

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  await next();
  c.res.headers.set("X-Content-Type-Options", "nosniff");
  c.res.headers.set("Referrer-Policy", "no-referrer");
  if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
});

app.onError((error, c) => {
  if (error instanceof ApiError) {
    if (error.status === 429) c.header("Retry-After", "60");
    return c.json(errorBody(error.code, error.message), error.status as 400);
  }
  // Share-link tokens live in the path; never write them to logs.
  const path = new URL(c.req.url).pathname.replace(/^\/i\/[^/]+/, "/i/<token>");
  console.error("Unhandled error", { path, error: String(error), stack: (error as Error).stack });
  return c.json(errorBody("internal", "Internal error"), 500);
});

app.notFound((c) => c.json(errorBody("not_found", "Not found"), 404));

/** Agents (no text/html in Accept) get markdown; browsers get the page. */
function wantsHtml(c: Context): boolean {
  return (c.req.header("Accept") ?? "").includes("text/html");
}

function markdown(c: Context, body: string) {
  return c.body(body, 200, { "Content-Type": "text/markdown; charset=utf-8" });
}

function html(c: Context, node: unknown) {
  return c.html(node as string, 200, PAGE_HEADERS);
}

app.get("/assets/app.css", (c) => c.body(CSS, 200, { "Content-Type": "text/css; charset=utf-8", "Cache-Control": "public, max-age=300" }));
app.get("/assets/app.js", (c) => c.body(JS, 200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" }));
app.get("/healthz", (c) => c.json({ ok: true }));

app.get("/", (c) => {
  const origin = new URL(c.req.url).origin;
  const domains = config(c.env).domains;
  if (!wantsHtml(c)) return markdown(c, serviceAgentsMd(origin, domains));
  return html(c, <LandingPage origin={origin} domain={domains[0] ?? ""} />);
});

for (const path of ["/agents.md", "/llms.txt", "/.well-known/agents.md"]) {
  app.get(path, (c) => markdown(c, serviceAgentsMd(new URL(c.req.url).origin, config(c.env).domains)));
}
app.get("/skill.md", (c) =>
  markdown(
    c,
    `---\nname: burnermail\ndescription: Create disposable email inboxes and wait for verification codes or links when testing sign-up, login or password-reset flows.\n---\n\n` +
      serviceAgentsMd(new URL(c.req.url).origin, config(c.env).domains),
  ),
);

app.route("/v1", v1);

// Capability pages live on the same sub-app as the capability API (registered before mounting).
capability.get("/", async (c) => {
  const p = c.get("principal") as Principal;
  if (p.kind !== "inbox") throw new ApiError(404, "not_found", "Not found");
  const token = c.req.param("token") ?? "";
  const origin = new URL(c.req.url).origin;
  if (!wantsHtml(c)) return markdown(c, inboxAgentsMd(origin, `/i/${token}`, p.inbox));
  const messages = await listMessages(c.env.DB, p.inbox.id, { since: 0, limit: 100, order: "desc" });
  const wanted = Number(c.req.query("m") ?? messages[0]?.id ?? 0);
  const selected = wanted ? await getMessage(c.env.DB, wanted) : null;
  return html(
    c,
    <CapabilityPage
      inbox={p.inbox}
      messages={messages}
      selected={selected && selected.inbox_id === p.inbox.id ? selected : null}
      token={token}
      images={c.req.query("images") === "1"}
    />,
  );
});
capability.get("/agents.md", (c) => {
  const p = c.get("principal") as Principal;
  if (p.kind !== "inbox") throw new ApiError(404, "not_found", "Not found");
  return markdown(c, inboxAgentsMd(new URL(c.req.url).origin, `/i/${c.req.param("token")}`, p.inbox));
});
app.route("/i/:token", capability);

app.route("/admin", admin);

export default {
  fetch: withMcp(app),
  email: (message, env) => receiveEmail(message, env),
  scheduled: async (_controller, env, ctx) => {
    ctx.waitUntil(purge(env));
  },
} satisfies ExportedHandler<Env>;
