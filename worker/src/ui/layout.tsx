import type { Child } from "hono/jsx";

export const CSS = `
:root{--bg:#f6f5f2;--panel:#fff;--ink:#1b1b1a;--muted:#6f6d68;--line:#e4e2dc;--accent:#d9480f;--accent-ink:#fff;--chip:#fff4ec;--chip-line:#f6c9ad;--mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;--sans:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--panel:#1d1d1b;--ink:#ecebe7;--muted:#9a978f;--line:#2f2e2b;--chip:#2a1d15;--chip-line:#5c3a26}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 var(--sans)}
a{color:inherit}a:hover{color:var(--accent)}
.top{display:flex;align-items:center;gap:16px;padding:14px 24px;border-bottom:1px solid var(--line);background:var(--panel)}
.brand{font-family:var(--mono);font-weight:700;letter-spacing:-.02em;text-decoration:none}.brand b{color:var(--accent)}
.top nav{display:flex;gap:14px;margin-left:auto;font-size:14px}.top nav a{text-decoration:none;color:var(--muted)}.top nav a:hover{color:var(--ink)}
main{max-width:1180px;margin:0 auto;padding:24px}
h1{font-size:22px;margin:0 0 4px;letter-spacing:-.01em}h2{font-size:15px;margin:28px 0 10px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.muted{color:var(--muted)}.mono{font-family:var(--mono)}.small{font-size:13px}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}tr:last-child td{border-bottom:0}
tr.link{cursor:pointer}tr.link:hover td{background:color-mix(in srgb,var(--accent) 5%,transparent)}
input,select{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
button,.btn{font:inherit;font-weight:600;border:1px solid var(--ink);background:var(--ink);color:var(--bg);border-radius:8px;padding:8px 14px;cursor:pointer;text-decoration:none;display:inline-block}
button.ghost,.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line)}button.danger{background:transparent;color:#c92a2a;border-color:#f1b0b0}
.chip{display:inline-flex;align-items:center;gap:8px;font-family:var(--mono);font-weight:700;background:var(--chip);border:1px solid var(--chip-line);border-radius:8px;padding:4px 10px}
.chip.big{font-size:26px;padding:8px 16px;letter-spacing:.08em}
.chip button{font-size:12px;padding:2px 8px;border-radius:6px}
.linkchip{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500;font-size:13px}
.notice{border:1px solid var(--chip-line);background:var(--chip);border-radius:12px;padding:14px 16px;margin:16px 0}
.split{display:grid;grid-template-columns:minmax(260px,380px) 1fr;gap:16px;align-items:start}@media (max-width:860px){.split{grid-template-columns:1fr}}
.msglist a{display:block;padding:12px 14px;border-bottom:1px solid var(--line);text-decoration:none}.msglist a:last-child{border-bottom:0}.msglist a.sel{background:color-mix(in srgb,var(--accent) 8%,transparent)}
.subj{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.viewer{padding:18px}.viewer iframe{width:100%;height:70vh;border:1px solid var(--line);border-radius:8px;background:#fff}
pre{white-space:pre-wrap;word-break:break-word;font:13px/1.5 var(--mono);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:12px;max-height:60vh;overflow:auto}
.empty{padding:40px;text-align:center;color:var(--muted)}
[data-socket][data-state=live] [data-status]{color:#2f9e44;font-weight:600}
[data-log]{font:12px/1.6 var(--mono);color:var(--muted);max-height:180px;overflow:auto;margin:10px 0 0;padding-left:18px}
.live{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}.live:before{content:"";width:8px;height:8px;border-radius:50%;background:#2f9e44;animation:p 1.6s infinite}@keyframes p{50%{opacity:.3}}
form.inline{display:inline}
`;

/** Client JS: copy buttons, confirm-on-submit, and live refresh via the long-poll endpoint. */
export const JS = `
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  e.preventDefault();
  navigator.clipboard.writeText(b.getAttribute("data-copy")).then(() => {
    const t = b.textContent; b.textContent = "copied"; setTimeout(() => (b.textContent = t), 1200);
  });
});
document.addEventListener("submit", (e) => {
  const msg = e.target.getAttribute("data-confirm");
  if (msg && !confirm(msg)) e.preventDefault();
});
const live = document.querySelector("[data-wait]");
if (live) {
  const url = live.getAttribute("data-wait");
  (async function loop() {
    for (;;) {
      try {
        const r = await fetch(url, { headers: { accept: "application/json" } });
        if (r.ok) { const j = await r.json(); if (j.message || j.changed) { location.reload(); return; } }
        else await new Promise((r) => setTimeout(r, 5000));
      } catch { await new Promise((r) => setTimeout(r, 5000)); }
    }
  })();
}
`;

export function Layout(props: { title: string; nav?: boolean; children: Child }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {props.nav ? null : <meta name="referrer" content="no-referrer" />}
        <title>{props.title} · mailmint</title>
        <link rel="stylesheet" href="/assets/app.css" />
        <script src="/assets/app.js" defer></script>
      </head>
      <body>
        <header class="top">
          <a class="brand" href={props.nav ? "/admin" : "/"}>
            mail<b>mint</b>
          </a>
          {props.nav ? (
            <nav>
              <a href="/admin">Inboxes</a>
              <a href="/admin/keys">API keys</a>
              <a href="/admin/connect">Connect</a>
            </nav>
          ) : null}
        </header>
        <main>{props.children}</main>
      </body>
    </html>
  );
}

export function CodeChip(props: { code: string; big?: boolean }) {
  return (
    <span class={props.big ? "chip big" : "chip"}>
      {props.code}
      <button type="button" class="ghost" data-copy={props.code}>
        copy
      </button>
    </span>
  );
}

export function LinkChip(props: { url: string }) {
  return (
    <span class="chip linkchip">
      <a href={props.url} target="_blank" rel="noopener noreferrer">
        {props.url}
      </a>
      <button type="button" class="ghost" data-copy={props.url}>
        copy
      </button>
    </span>
  );
}

export function relTime(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  const future = s < 0;
  const a = Math.abs(s);
  const v =
    a < 60 ? `${a}s` : a < 3600 ? `${Math.round(a / 60)}m` : a < 86400 ? `${Math.round(a / 3600)}h` : `${Math.round(a / 86400)}d`;
  return future ? `in ${v}` : `${v} ago`;
}

/** agent-socket relay used by "Connect an AI chat" (/admin/connect); also allowed in connect-src. */
export const AGENT_SOCKET_RELAY = "https://agentsocket.dev";

export const PAGE_HEADERS = {
  "Content-Security-Policy":
    `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${AGENT_SOCKET_RELAY} ${AGENT_SOCKET_RELAY.replace(/^https:/, "wss:")}; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
};
