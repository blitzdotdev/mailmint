import type { Child } from "hono/jsx";
import { Hono, type Context } from "hono";
import { type AccessIdentity, requireWebAccess } from "../api/access.ts";
import type { Principal } from "../api/auth.ts";
import { createInbox, findInbox, findMessage, issueInboxLink, messageAttachment, messageHtml, updateInboxSettings, type CreatedInbox } from "../api/ops.ts";
import { htmlResponse, ownerApi } from "../api/rest.ts";
import { contentDisposition } from "../lib/text.ts";
import { waitForMessage } from "../api/wait.ts";
import type { Env } from "../env.ts";
import { config, type Config } from "../lib/config.ts";
import { ApiError } from "../lib/errors.ts";
import { createApiKey, listApiKeys, revokeApiKey } from "../store/api-keys.ts";
import { deleteInbox, listInboxes, type InboxRow } from "../store/inboxes.ts";
import { getMessage, listMessages, type MessageRow } from "../store/messages.ts";
import { AGENT_SOCKET_RELAY, BrandMark, CopyButton, EmptyState, Head, Icon, LiveBadge, PAGE_HEADERS, SecretRow, relTime, type IconName } from "./layout.tsx";
import { InboxHead, InboxPanes, MessageItem, MessageReader } from "./views.tsx";

type AdminEnv = { Bindings: Env; Variables: { identity: AccessIdentity } };
type AdminContext = Context<AdminEnv>;
const OWNER: Principal = { kind: "owner", name: "admin" };

export const admin = new Hono<AdminEnv>();

admin.use("*", requireWebAccess);
// Same-origin only for every state change (Access cookies ride along cross-site otherwise).
// Sec-Fetch-Site is set by the browser and can't be forged by a page, so it decides when
// present; Origin is the fallback (it can legitimately be "null" for same-origin posts
// under some referrer policies, which is why it isn't checked first).
admin.use("*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") {
    const site = c.req.header("Sec-Fetch-Site");
    const origin = c.req.header("Origin");
    const crossSite = site
      ? site !== "same-origin" && site !== "none"
      : !!origin && origin !== new URL(c.req.url).origin;
    if (crossSite) return c.text("Cross-site request refused", 403);
  }
  await next();
});
admin.use("*", async (c, next) => {
  await next();
  if (c.res.headers.get("Content-Type")?.startsWith("text/html") && !c.res.headers.has("Content-Security-Policy")) {
    for (const [k, v] of Object.entries(PAGE_HEADERS)) if (k !== "Referrer-Policy") c.res.headers.set(k, v);
  }
  // Dashboard URLs carry no secrets; same-origin keeps a real Origin on our own form posts.
  if (!c.res.headers.has("Referrer-Policy")) c.res.headers.set("Referrer-Policy", "same-origin");
});

// ---------- shell: sidebar | content (mailroom layout) ----------

type Active = { kind: "all" } | { kind: "inbox"; address: string } | { kind: "new" } | { kind: "keys" } | { kind: "connect" } | { kind: "none" };

function NavItem(props: { href: string; icon: IconName; label: string; current: boolean; count?: number }) {
  return (
    <a class="sb-item" href={props.href} aria-current={props.current ? "page" : undefined}>
      <Icon name={props.icon} />
      <span class="truncate grow">{props.label}</span>
      {props.count ? <span class="count">{props.count}</span> : null}
    </a>
  );
}

function Shell(props: { inboxes: InboxRow[]; active: Active; q: string; children: Child }) {
  const { active } = props;
  return (
    <div class="app">
      <aside class="sidebar">
        <div class="sb-head">
          <a class="brand" href="/admin">
            <BrandMark />
            mailmint
          </a>
        </div>
        <div class="sb-new">
          <a class="btn outline" href="/admin/new" aria-current={active.kind === "new" ? "page" : undefined}>
            <Icon name="plus" />
            New inbox
          </a>
        </div>
        <form class="sb-search" method="get" action="/admin" role="search">
          <div class="search">
            <Icon name="search" />
            <input class="input" name="q" value={props.q} placeholder="Find an inbox" aria-label="Find an inbox" />
          </div>
        </form>
        <nav class="sb-nav" aria-label="Mail">
          <NavItem href="/admin" icon="inbox" label="All mail" current={active.kind === "all"} />
          <p class="sb-label">{props.q ? `Inboxes matching “${props.q}”` : "Inboxes"}</p>
          {props.inboxes.length ? (
            <div class="sb-group" role="group" aria-label="Inboxes">
              {props.inboxes.map((i) => (
                <a
                  class="sb-item addr"
                  href={`/admin/inbox/${encodeURIComponent(i.address)}`}
                  title={i.label ? `${i.address} (${i.label})` : i.address}
                  aria-current={active.kind === "inbox" && active.address === i.address ? "page" : undefined}
                >
                  <span class="truncate grow">{i.address.split("@")[0]}</span>
                  {i.message_count ? <span class="count">{i.message_count}</span> : null}
                </a>
              ))}
            </div>
          ) : (
            <p class="sb-empty">{props.q ? "No matches." : "None yet."}</p>
          )}
        </nav>
        <div class="sb-foot">
          <NavItem href="/admin/keys" icon="key" label="API keys" current={active.kind === "keys"} />
          <NavItem href="/admin/connect" icon="plug" label="Connect" current={active.kind === "connect"} />
          <NavItem href="/agents.md" icon="book" label="agents.md" current={false} />
        </div>
      </aside>
      <header class="mobile-bar">
        <a class="brand" href="/admin">
          <BrandMark />
          mailmint
        </a>
        <a class="btn ghost icon" href="/admin/new" aria-label="New inbox"><Icon name="plus" /></a>
        <a class="btn ghost icon" href="/admin/keys" aria-label="API keys"><Icon name="key" /></a>
        <a class="btn ghost icon" href="/admin/connect" aria-label="Connect"><Icon name="plug" /></a>
      </header>
      {props.children}
    </div>
  );
}

async function page(c: AdminContext, title: string, active: Active, body: Child, status: 200 | 400 | 404 = 200) {
  const q = c.req.query("q") ?? "";
  const inboxes = await listInboxes(c.env.DB, { limit: 200, query: q || null });
  return c.html(
    <html lang="en">
      <Head title={title} />
      <body>
        <Shell inboxes={inboxes} active={active} q={q}>
          {body}
        </Shell>
      </body>
    </html>,
    status,
  );
}

/** Settings-style page body (keys, connect, new inbox). */
function Page(props: { title: string; desc?: Child; children: Child }) {
  return (
    <main class="page">
      <div class="page-inner">
        <div class="page-head">
          <h1>{props.title}</h1>
          {props.desc ? <p>{props.desc}</p> : null}
        </div>
        {props.children}
      </div>
    </main>
  );
}

async function form(c: AdminContext): Promise<Record<string, string>> {
  const data = await c.req.parseBody();
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) if (typeof v === "string") out[k] = v;
  return out;
}

function hours(value: string | undefined): number | null {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : null;
}

function ttlLabel(h: number): string {
  return h % 24 === 0 ? `${h / 24} ${h === 24 ? "day" : "days"}` : `${h} ${h === 1 ? "hour" : "hours"}`;
}

// The REST API for this page's own scripts (agent-socket tools); owner, behind Access + same-origin.
admin.route("/api", ownerApi);

// ---------- new inbox form ----------

function NewInboxForm(props: { cfg: Config }) {
  const { cfg } = props;
  const ttls = [...new Set([1, 24, cfg.defaultTtlHours, cfg.maxTtlHours])].filter((h) => h <= cfg.maxTtlHours).sort((a, b) => a - b);
  return (
    <form method="post" action="/admin/inboxes" class="card">
      <div class="card-body vstack" style="gap:14px">
        <div class="grid-form">
          <div class="field">
            <label for="nf-local">Address</label>
            <input id="nf-local" class="input mono" name="local" placeholder="blank = random, e.g. quiet-otter-4k7m" autocomplete="off" />
          </div>
          <span class="at">@</span>
          <div class="field">
            <label for="nf-domain">Domain</label>
            <select id="nf-domain" class="select" name="domain">{cfg.domains.map((d) => <option>{d}</option>)}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="field">
            <label for="nf-label">Label</label>
            <input id="nf-label" class="input" name="label" placeholder="optional, e.g. github signup test" />
          </div>
          <div class="field" style="flex:0 0 150px;min-width:0">
            <label for="nf-ttl">Keep for</label>
            <select id="nf-ttl" class="select" name="ttl_hours">
              {ttls.map((h) => <option value={String(h)} selected={h === cfg.defaultTtlHours}>{ttlLabel(h)}</option>)}
            </select>
          </div>
          <button class="btn">
            <Icon name="plus" />
            Create inbox
          </button>
        </div>
      </div>
    </form>
  );
}

function DomainNote(props: { cfg: Config }) {
  const domains = props.cfg.domains.map((d) => `*@${d}`).join(", ");
  return props.cfg.acceptUnknown ? (
    <>Mail to any <span class="mono">{domains}</span> is accepted; addresses nobody created become catch-all inboxes that expire {ttlLabel(props.cfg.autoTtlHours)} after their last message.</>
  ) : (
    <>Strict mode: only inboxes created here or through the API accept mail ({domains}).</>
  );
}

admin.get("/new", (c) => {
  const cfg = config(c.env);
  return page(
    c,
    "New inbox",
    { kind: "new" },
    <Page title="New inbox" desc={<DomainNote cfg={cfg} />}>
      <NewInboxForm cfg={cfg} />
      <p class="xs muted">
        Each created inbox gets a share link that reads just that inbox, without a login. It is shown once, on the next page.
      </p>
    </Page>,
  );
});

// ---------- all mail ----------

interface LatestRow extends MessageRow {
  address: string;
}

admin.get("/", async (c) => {
  const { results: latest } = await c.env.DB.prepare(
    `SELECT m.id, m.inbox_id, m.subject, m.from_address, m.from_name, m.envelope_from, m.best_code, m.best_link,
            m.received_at, m.tag, m.attachments_json, i.address
     FROM messages m JOIN inboxes i ON i.id = m.inbox_id ORDER BY m.id DESC LIMIT 50`,
  ).all<LatestRow>();
  const maxId = latest[0]?.id ?? 0;
  const cfg = config(c.env);
  const wanted = Number(c.req.query("m") ?? 0);
  const selected = wanted ? await getMessage(c.env.DB, wanted) : null;
  const images = c.req.query("images") === "1";
  return page(
    c,
    "All mail",
    { kind: "all" },
    <main class="main" data-view={selected ? "reader" : "list"}>
      <section class="list" aria-label="Latest mail">
        <div class="list-head">
          <div class="list-title">
            <h1 class="grow">Latest mail</h1>
            <LiveBadge url={`/admin/latest?since=${maxId}`} label="Live" />
          </div>
          <p class="list-meta">Newest across every inbox.</p>
        </div>
        <div class="list-body">
          {latest.length ? (
            latest.map((m) => (
              <MessageItem
                m={m}
                href={`/admin?m=${m.id}`}
                current={selected?.id === m.id}
                to={m.tag ? m.address.replace("@", `+${m.tag}@`) : m.address}
              />
            ))
          ) : (
            <div class="list-empty">No mail yet.</div>
          )}
        </div>
      </section>
      {selected ? (
        <MessageReader m={selected} base={`/admin/messages/${selected.id}`} images={images} back="/admin" selfUrl={`/admin?m=${selected.id}`} />
      ) : latest.length ? (
        <section class="reader">
          <EmptyState icon="mail" title="Select a message">
            Codes and verification links are pulled out of every message as it arrives.
          </EmptyState>
        </section>
      ) : (
        <section class="reader">
          <div class="reader-body">
            <div class="reader-inner" style="max-width:640px;margin:48px auto 0">
              <div class="page-head">
                <h2 style="font-size:17px">Create your first inbox</h2>
                <p class="small muted"><DomainNote cfg={cfg} /></p>
              </div>
              <NewInboxForm cfg={cfg} />
            </div>
          </div>
        </section>
      )}
    </main>,
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
    <div class="alert">
      <span class="alert-title">{props.fresh ? "Inbox created." : "New share link issued; the old one no longer works."}</span>
      <span class="xs">Save the share link now, it is shown only once. Anyone with it can read this inbox.</span>
      <SecretRow value={props.created.url} href />
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
    if (error instanceof ApiError) {
      return page(
        c,
        "New inbox",
        { kind: "new" },
        <Page title="New inbox">
          <div class="alert error"><span class="alert-title">{error.message}</span></div>
          <NewInboxForm cfg={config(c.env)} />
        </Page>,
        400,
      );
    }
    throw error;
  }
  return renderInbox(c, created.inbox, <CreatedNotice created={created} fresh />);
});

// ---------- one inbox ----------

async function renderInbox(c: AdminContext, inbox: InboxRow, notice?: Child) {
  const messages = await listMessages(c.env.DB, inbox.id, { since: 0, limit: 100, order: "desc" });
  const wanted = Number(c.req.query("m") ?? messages[0]?.id ?? 0);
  const selected = wanted ? await getMessage(c.env.DB, wanted) : null;
  const enc = encodeURIComponent(inbox.address);
  const listUrl = `/admin/inbox/${enc}`;
  return page(
    c,
    inbox.address,
    { kind: "inbox", address: inbox.address },
    <InboxPanes
      inbox={inbox}
      messages={messages}
      selected={selected && selected.inbox_id === inbox.id ? selected : null}
      explicit={c.req.query("m") !== undefined}
      listUrl={listUrl}
      messageBase={(id) => `/admin/messages/${id}`}
      images={c.req.query("images") === "1"}
      head={
        <InboxHead
          inbox={inbox}
          waitUrl={`/admin/wait/${enc}?since=${messages[0]?.id ?? 0}`}
          nextUrl={listUrl}
          note={notice}
          actions={
            <div class="hstack wrap" style="gap:6px">
              <form class="inline" method="post" action={`${listUrl}/extend`}>
                <input type="hidden" name="ttl_hours" value={String(config(c.env).defaultTtlHours)} />
                <button class="btn outline xs">
                  <Icon name="clock" size="xs" />
                  <span data-label>Keep {ttlLabel(config(c.env).defaultTtlHours)} more</span>
                </button>
              </form>
              <form class="inline" method="post" action={`${listUrl}/link`} data-confirm={inbox.token_hash ? "Issue a new link? The current link stops working." : ""}>
                <button class="btn outline xs">
                  <Icon name="share" size="xs" />
                  <span data-label>{inbox.token_hash ? "New share link" : "Create share link"}</span>
                </button>
              </form>
              <form class="inline" method="post" action={`${listUrl}/delete`} data-confirm={`Delete ${inbox.address} and all its mail?`}>
                <button class="btn destructive xs">
                  <Icon name="trash" size="xs" />
                  <span data-label>Delete</span>
                </button>
              </form>
            </div>
          }
        />
      }
    />,
  );
}

admin.get("/inbox/:address", async (c) => {
  try {
    return await renderInbox(c, await findInbox(c.env, OWNER, c.req.param("address")));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return page(
        c,
        "Not found",
        { kind: "none" },
        <main class="page" style="display:flex">
          <EmptyState icon="inbox" title="Inbox not found">
            It may have expired or been deleted. <a href="/admin">Back to all mail</a>
          </EmptyState>
        </main>,
        404,
      );
    }
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

async function keysPage(c: AdminContext, reveal?: { key: string; name: string }) {
  const keys = await listApiKeys(c.env.DB);
  const origin = new URL(c.req.url).origin;
  return page(
    c,
    "API keys",
    { kind: "keys" },
    <Page title="API keys" desc="Owner keys for the REST API and the CLI. A key can create, read and delete every inbox.">
      {reveal ? (
        <div class="alert">
          <span class="alert-title">Key “{reveal.name}” created. Copy it now; it is shown only once.</span>
          <SecretRow value={reveal.key} />
          <pre>{`npx mailmint login --url ${origin} --key ${reveal.key}`}</pre>
        </div>
      ) : null}
      <form method="post" action="/admin/keys" class="card">
        <div class="card-body form-row">
          <div class="field">
            <label for="key-name">Name</label>
            <input id="key-name" class="input" name="name" placeholder="e.g. laptop or ci" required />
          </div>
          <button class="btn">
            <Icon name="plus" />
            Create key
          </button>
        </div>
      </form>
      <div class="card">
        {keys.length === 0 ? (
          <div class="list-empty">No keys yet.</div>
        ) : (
          <table class="tbl">
            <thead>
              <tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr class={k.revoked_at ? "revoked" : ""}>
                  <td>
                    <div style="font-weight:500">{k.name}</div>
                    {k.created_by ? <div class="xs muted">{k.created_by}</div> : null}
                  </td>
                  <td class="mono xs">{k.prefix}…</td>
                  <td class="xs muted tnum">{relTime(k.created_at)}</td>
                  <td class="xs muted tnum">{relTime(k.last_used_at)}</td>
                  <td style="text-align:right">
                    {k.revoked_at ? (
                      <span class="badge secondary">revoked</span>
                    ) : (
                      <form class="inline" method="post" action={`/admin/keys/${k.id}/revoke`} data-confirm={`Revoke ${k.name}?`}>
                        <button class="btn destructive xs"><span data-label>Revoke</span></button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Page>,
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

function Section(props: { icon: IconName; title: string; desc: Child; children: Child }) {
  return (
    <section class="card">
      <div class="card-head">
        <span class="empty-icon" style="width:32px;height:32px;margin:0">
          <Icon name={props.icon} size="sm" />
        </span>
        <div class="grow">
          <h2 class="card-title">{props.title}</h2>
          <p class="card-desc">{props.desc}</p>
        </div>
      </div>
      <div class="card-body vstack">{props.children}</div>
    </section>
  );
}

admin.get("/connect", (c) => {
  const origin = new URL(c.req.url).origin;
  return page(
    c,
    "Connect",
    { kind: "connect" },
    <Page title="Connect agents and tools" desc="Four ways for an agent to create inboxes and wait for codes. All of them use the same operations as this dashboard.">
      <Section icon="plug" title="Any AI chat (agent-socket)" desc="For chats without MCP (claude.ai, ChatGPT, …). This tab becomes an agent-socket app while it stays open.">
        <div class="vstack" data-socket data-relay={AGENT_SOCKET_RELAY}>
          <p class="small">
            Create a link and paste it into the chat. It can then create inboxes, wait for codes and links, and read mail
            with your access. Learn more at{" "}
            <a href="https://agentsocket.dev" target="_blank" rel="noopener noreferrer">agentsocket.dev</a>.
          </p>
          <div class="hstack wrap">
            <button type="button" class="btn" data-start>
              <Icon name="link" />
              Create link
            </button>
            <button type="button" class="btn destructive" data-stop hidden>Stop</button>
            <span class="small muted" data-status>Not connected.</span>
          </div>
          <div class="hstack" data-link-row hidden style="min-width:0">
            <span class="mono truncate grow codeblock" style="padding:7px 10px" data-link></span>
            <button type="button" class="btn outline sm" data-copy-link data-copy="">
              <Icon name="copy" size="sm" />
              <span data-label>Copy</span>
            </button>
          </div>
          <p class="xs muted">
            The link is a key: anyone with it can use these tools until you press Stop or close the tab. Terminal
            equivalent: <span class="mono">mailmint connect</span>.
          </p>
          <ul data-log></ul>
        </div>
        <script type="module" src="/assets/connect.js"></script>
      </Section>
      <Section icon="terminal" title="CLI" desc="Zero-dependency Node CLI; keys come from the API keys page.">
        <pre>{`npx mailmint login --url ${origin} --key <key from API keys>
addr=$(npx mailmint new --label "github signup")
code=$(npx mailmint wait "$addr" --code)`}</pre>
      </Section>
      <Section icon="at" title="MCP" desc="OAuth: you approve each client on this instance.">
        <div class="field">
          <label>Server URL</label>
          <div class="hstack">
            <pre class="grow">{`${origin}/mcp`}</pre>
            <CopyButton value={`${origin}/mcp`} />
          </div>
        </div>
        <div class="field">
          <label>Claude Code</label>
          <pre>{`claude mcp add --transport http mailmint ${origin}/mcp`}</pre>
        </div>
      </Section>
      <Section icon="book" title="Any agent" desc="Plain HTTP, described in markdown.">
        <p class="small">
          Give it <a href="/agents.md" class="mono">{origin}/agents.md</a> plus an API key, or create an inbox and paste its
          share link + <span class="mono">/agents.md</span> (no key needed, one inbox only).
        </p>
      </Section>
    </Page>,
  );
});
