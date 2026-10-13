import { Hono, type Context } from "hono";
import { type AccessIdentity, requireWebAccess } from "../api/access.ts";
import type { Principal } from "../api/auth.ts";
import { createInbox, findInbox, findMessage, issueInboxLink, messageAttachment, messageHtml, updateInboxSettings, type CreatedInbox } from "../api/ops.ts";
import { htmlResponse } from "../api/rest.ts";
import { contentDisposition } from "../lib/text.ts";
import { waitForMessage } from "../api/wait.ts";
import type { Env } from "../env.ts";
import { config } from "../lib/config.ts";
import { ApiError } from "../lib/errors.ts";
import { createApiKey, listApiKeys, revokeApiKey } from "../store/api-keys.ts";
import { deleteInbox, listInboxes, type InboxRow } from "../store/inboxes.ts";
import { getMessage, listMessages, type MessageRow } from "../store/messages.ts";
import { CodeChip, Layout, LinkChip, PAGE_HEADERS, relTime } from "./layout.tsx";
import { InboxView } from "./views.tsx";

type AdminEnv = { Bindings: Env; Variables: { identity: AccessIdentity } };
const OWNER: Principal = { kind: "owner", name: "admin" };

export const admin = new Hono<AdminEnv>();

admin.use("*", requireWebAccess);
// Same-origin only for every state change (Access cookies ride along cross-site otherwise).
admin.use("*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const origin = c.req.header("Origin");
    const site = c.req.header("Sec-Fetch-Site");
    if ((origin && origin !== new URL(c.req.url).origin) || (site && site !== "same-origin" && site !== "none")) {
      return c.text("Cross-site request refused", 403);
    }
  }
  await next();
});
admin.use("*", async (c, next) => {
  await next();
  if (c.res.headers.get("Content-Type")?.startsWith("text/html") && !c.res.headers.has("Content-Security-Policy")) {
    for (const [k, v] of Object.entries(PAGE_HEADERS)) c.res.headers.set(k, v);
  }
});

function page(c: Context<AdminEnv>, title: string, body: unknown, status: 200 | 201 | 400 | 404 = 200) {
  return c.html(<Layout title={title} nav>{body as never}</Layout>, status);
}

async function form(c: Context<AdminEnv>): Promise<Record<string, string>> {
  const data = await c.req.parseBody();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) if (typeof v === "string") out[k] = v;
  return out;
}

function hours(value: string | undefined): number | null {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : null;
}

// ---------- inbox list ----------

interface LatestRow extends MessageRow {
  address: string;
}

admin.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const inboxes = await listInboxes(c.env.DB, { limit: 200, query: q || null });
  const { results: latest } = await c.env.DB.prepare(
    `SELECT m.id, m.subject, m.from_address, m.from_name, m.envelope_from, m.best_code, m.best_link, m.received_at, m.tag, i.address
     FROM messages m JOIN inboxes i ON i.id = m.inbox_id ORDER BY m.id DESC LIMIT 12`,
  ).all<LatestRow>();
  const maxId = latest[0]?.id ?? 0;
  const cfg = config(c.env);
  return page(
    c,
    "Inboxes",
    <>
      <div class="row" style="justify-content:space-between">
        <div>
          <h1>Inboxes</h1>
          <div class="muted small">
            Mail to any <b class="mono">*@{cfg.domains.join(", *@")}</b>{" "}
            {cfg.acceptUnknown ? "is accepted (unknown addresses become catch-all inboxes)" : "is accepted only for created inboxes"}.
          </div>
        </div>
        <span class="live" data-wait={`/admin/latest?since=${maxId}`}>live</span>
      </div>

      <form method="post" action="/admin/inboxes" class="panel row" style="padding:14px;margin-top:16px">
        <input name="local" placeholder="name (blank = random)" style="flex:1;min-width:180px" class="mono" />
        <span class="mono muted">@</span>
        <select name="domain">{cfg.domains.map((d) => <option>{d}</option>)}</select>
        <input name="label" placeholder="label (optional)" style="width:180px" />
        <select name="ttl_hours">
          <option value="1">1 hour</option>
          <option value="24">1 day</option>
          <option value={String(cfg.defaultTtlHours)} selected>{cfg.defaultTtlHours / 24} days</option>
          <option value={String(cfg.maxTtlHours)}>{Math.round(cfg.maxTtlHours / 24)} days</option>
        </select>
        <button>New inbox</button>
      </form>

      {latest.length ? (
        <>
          <h2>Latest mail</h2>
          <div class="panel">
            <table>
              {latest.map((m) => (
                <tr>
                  <td class="mono small"><a href={`/admin/inbox/${encodeURIComponent(m.address)}?m=${m.id}`}>{m.tag ? m.address.replace("@", `+${m.tag}@`) : m.address}</a></td>
                  <td><div class="subj">{m.subject || "(no subject)"}</div><div class="small muted">{m.from_name || m.from_address || m.envelope_from}</div></td>
                  <td>{m.best_code ? <CodeChip code={m.best_code} /> : m.best_link ? <span class="small"><a href={m.best_link} target="_blank" rel="noopener noreferrer">verification link ↗</a></span> : null}</td>
                  <td class="small muted" style="white-space:nowrap">{relTime(m.received_at)}</td>
                </tr>
              ))}
            </table>
          </div>
        </>
      ) : null}

      <div class="row" style="justify-content:space-between;margin-top:28px">
        <h2 style="margin:0">All inboxes ({inboxes.length})</h2>
        <form method="get" class="row"><input name="q" value={q} placeholder="search" /></form>
      </div>
      <div class="panel" style="margin-top:10px">
        {inboxes.length === 0 ? (
          <div class="empty">No inboxes yet.</div>
        ) : (
          <table>
            <tr><th>Address</th><th>Kind</th><th>Messages</th><th>Last mail</th><th>Expires</th></tr>
            {inboxes.map((i) => (
              <tr>
                <td class="mono"><a href={`/admin/inbox/${encodeURIComponent(i.address)}`}>{i.address}</a>{i.label ? <div class="small muted" style="font-family:var(--sans)">{i.label}</div> : null}</td>
                <td class="small">{i.origin === "auto" ? "catch-all" : "created"}</td>
                <td>{i.message_count}</td>
                <td class="small muted">{relTime(i.last_message_at)}</td>
                <td class="small muted">{relTime(i.expires_at)}</td>
              </tr>
            ))}
          </table>
        )}
      </div>
    </>,
  );
});

admin.get("/latest", async (c) => {
  const since = Number(c.req.query("since") ?? "0");
  // Poll-based (there's no global signal): the page asks every few seconds.
  for (let i = 0; i < 5; i++) {
    const row = await c.env.DB.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM messages").first<{ id: number }>();
    if ((row?.id ?? 0) > since) return c.json({ changed: true });
    await new Promise((r) => setTimeout(r, 3000));
  }
  return c.json({ changed: false });
});

// ---------- create / link reveal ----------

function CreatedNotice(props: { created: CreatedInbox; fresh: boolean }) {
  return (
    <div class="notice">
      <div style="font-weight:600;margin-bottom:6px">{props.fresh ? "Inbox created." : "New link issued; the old link no longer works."} Save this link now; it is shown only once.</div>
      <div class="row"><LinkChip url={props.created.url} /></div>
      <div class="small muted" style="margin-top:8px">
        Anyone with the link can read this inbox (no login). Paste <span class="mono">{props.created.url}/agents.md</span> to an agent.
      </div>
    </div>
  );
}

admin.post("/inboxes", async (c) => {
  const f = await form(c);
  let created: CreatedInbox;
  try {
    created = await createInbox(c.env, new URL(c.req.url).origin, {
      local: f.local || null,
      domain: f.domain || null,
      label: f.label || null,
      ttl_hours: hours(f.ttl_hours),
    });
  } catch (error) {
    if (error instanceof ApiError) return page(c, "Error", <div class="notice">{error.message} <a href="/admin">Back</a></div>, 400);
    throw error;
  }
  return renderInbox(c, created.inbox, <CreatedNotice created={created} fresh />);
});

// ---------- one inbox ----------

async function renderInbox(c: Context<AdminEnv>, inbox: InboxRow, notice?: unknown) {
  const messages = await listMessages(c.env.DB, inbox.id, { since: 0, limit: 100, order: "desc" });
  const selectedId = Number(c.req.query("m") ?? messages[0]?.id ?? 0);
  const selected = selectedId ? await getMessage(c.env.DB, selectedId) : null;
  const enc = encodeURIComponent(inbox.address);
  return page(
    c,
    inbox.address,
    <>
      {notice as never}
      <InboxView
        inbox={inbox}
        messages={messages}
        selected={selected && selected.inbox_id === inbox.id ? selected : null}
        messageBase={(id) => `/admin/messages/${id}`}
        waitUrl={`/admin/wait/${enc}?since=${messages[0]?.id ?? 0}`}
        images={c.req.query("images") === "1"}
        header={
          <div class="row small" style="margin-top:12px">
            <form class="inline" method="post" action={`/admin/inbox/${enc}/extend`}>
              <input type="hidden" name="ttl_hours" value="168" /><button class="ghost">Keep 7 more days</button>
            </form>
            <form class="inline" method="post" action={`/admin/inbox/${enc}/link`} data-confirm={inbox.token_hash ? "Issue a new link? The current link stops working." : ""}>
              <button class="ghost">{inbox.token_hash ? "New share link" : "Create share link"}</button>
            </form>
            <form class="inline" method="post" action={`/admin/inbox/${enc}/delete`} data-confirm={`Delete ${inbox.address} and all its mail?`}>
              <button class="danger">Delete</button>
            </form>
          </div>
        }
      />
    </>,
  );
}

admin.get("/inbox/:address", async (c) => {
  try {
    return await renderInbox(c, await findInbox(c.env, OWNER, c.req.param("address")));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return page(c, "Not found", <div class="empty">Inbox not found. <a href="/admin">Back</a></div>, 404);
    throw error;
  }
});

admin.post("/inbox/:address/extend", async (c) => {
  const inbox = await findInbox(c.env, OWNER, c.req.param("address"));
  const f = await form(c);
  await updateInboxSettings(c.env, inbox, { ttl_hours: hours(f.ttl_hours) ?? config(c.env).defaultTtlHours });
  return c.redirect(`/admin/inbox/${encodeURIComponent(inbox.address)}`, 303);
});

admin.post("/inbox/:address/link", async (c) => {
  const inbox = await findInbox(c.env, OWNER, c.req.param("address"));
  const created = await issueInboxLink(c.env, new URL(c.req.url).origin, inbox);
  return renderInbox(c, created.inbox, <CreatedNotice created={created} fresh={false} />);
});

admin.post("/inbox/:address/delete", async (c) => {
  const inbox = await findInbox(c.env, OWNER, c.req.param("address"));
  await deleteInbox(c.env, inbox);
  return c.redirect("/admin", 303);
});

admin.get("/wait/:address", async (c) => {
  const inbox = await findInbox(c.env, OWNER, c.req.param("address"));
  const since = Number(c.req.query("since") ?? "0");
  const { message } = await waitForMessage(c.env, inbox, Number.isFinite(since) ? since : 0, {}, 55_000);
  return c.json({ message: message ? { id: message.id } : null });
});

// ---------- message sub-resources ----------

admin.get("/messages/:id/html", async (c) => {
  const m = await findMessage(c.env, OWNER, Number(c.req.param("id")));
  return htmlResponse(c, await messageHtml(c.env, m), c.req.query("images") === "1");
});

admin.get("/messages/:id/raw", async (c) => {
  const m = await findMessage(c.env, OWNER, Number(c.req.param("id")));
  const object = await c.env.RAW.get(m.raw_key);
  if (!object) return c.text("Raw message is gone", 404);
  return new Response(object.body, {
    headers: { "Content-Type": "message/rfc822", "Content-Disposition": `attachment; filename="message-${m.id}.eml"` },
  });
});

admin.get("/messages/:id/attachments/:n", async (c) => {
  const m = await findMessage(c.env, OWNER, Number(c.req.param("id")));
  const index = Number(c.req.param("n"));
  const { meta, body } = await messageAttachment(c.env, m, index);
  return new Response(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": contentDisposition(meta.filename ?? `attachment-${index}`),
    },
  });
});

// ---------- API keys ----------

async function keysPage(c: Context<AdminEnv>, reveal?: { key: string; name: string }) {
  const keys = await listApiKeys(c.env.DB);
  const origin = new URL(c.req.url).origin;
  return page(
    c,
    "API keys",
    <>
      <h1>API keys</h1>
      <p class="muted small">Owner keys for the REST API and the CLI. They can create, read and delete every inbox.</p>
      {reveal ? (
        <div class="notice">
          <div style="font-weight:600;margin-bottom:6px">Key "{reveal.name}" created. Copy it now; it is shown only once.</div>
          <CodeChip code={reveal.key} />
          <pre style="margin-top:10px">{`npx burnermail login --url ${origin} --key ${reveal.key}`}</pre>
        </div>
      ) : null}
      <form method="post" action="/admin/keys" class="panel row" style="padding:14px">
        <input name="name" placeholder="name, e.g. laptop or ci" required style="flex:1" />
        <button>Create key</button>
      </form>
      <div class="panel" style="margin-top:16px">
        {keys.length === 0 ? <div class="empty">No keys yet.</div> : (
          <table>
            <tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr>
            {keys.map((k) => (
              <tr style={k.revoked_at ? "opacity:.5" : ""}>
                <td>{k.name}<div class="small muted">{k.created_by ?? ""}</div></td>
                <td class="mono small">{k.prefix}…</td>
                <td class="small muted">{relTime(k.created_at)}</td>
                <td class="small muted">{relTime(k.last_used_at)}</td>
                <td>{k.revoked_at ? <span class="small muted">revoked</span> : (
                  <form method="post" action={`/admin/keys/${k.id}/revoke`} data-confirm={`Revoke ${k.name}?`}><button class="danger small">Revoke</button></form>
                )}</td>
              </tr>
            ))}
          </table>
        )}
      </div>
    </>,
  );
}

admin.get("/keys", (c) => keysPage(c));

admin.post("/keys", async (c) => {
  const name = (await form(c)).name?.trim().slice(0, 80);
  if (!name) return keysPage(c);
  const { key } = await createApiKey(c.env.DB, name, c.get("identity").email);
  return keysPage(c, { key, name });
});

admin.post("/keys/:id/revoke", async (c) => {
  await revokeApiKey(c.env.DB, Number(c.req.param("id")));
  return c.redirect("/admin/keys", 303);
});

// ---------- connect instructions ----------

admin.get("/connect", (c) => {
  const origin = new URL(c.req.url).origin;
  return page(
    c,
    "Connect",
    <>
      <h1>Connect agents and tools</h1>
      <h2>CLI</h2>
      <div class="panel" style="padding:14px">
        <pre style="margin:0">{`npx burnermail login --url ${origin} --key <key from API keys>
addr=$(npx burnermail new --label "github signup")
code=$(npx burnermail wait "$addr" --code)`}</pre>
      </div>
      <h2>MCP</h2>
      <div class="panel" style="padding:14px">
        <p style="margin-top:0">Server URL (OAuth; you approve each client here):</p>
        <pre>{`${origin}/mcp`}</pre>
        <p>Claude Code:</p>
        <pre>{`claude mcp add --transport http burnermail ${origin}/mcp`}</pre>
      </div>
      <h2>Any agent</h2>
      <div class="panel" style="padding:14px">
        <p style="margin:0">Give it <a href="/agents.md" class="mono">{origin}/agents.md</a> plus an API key, or create an inbox and paste its
        share link + <span class="mono">/agents.md</span> (no key needed, one inbox only).</p>
      </div>
    </>,
  );
});
