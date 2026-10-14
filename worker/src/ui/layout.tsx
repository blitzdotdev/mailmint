import { raw } from "hono/html";
import type { Child } from "hono/jsx";

// Design system: cf-mailroom's shadcn theme (radix-nova, neutral, Geist) ported to plain CSS so the
// pages stay server-rendered with no build step. Tokens match mailroom's src/web/index.css; the one
// addition is a mint accent for extracted codes and links.
export const CSS = `
@font-face{font-family:Geist;src:url(/assets/fonts/geist.woff2) format("woff2");font-weight:100 900;font-display:swap}
:root{
  --background:oklch(1 0 0);--canvas:oklch(0.984 0.002 265);--foreground:oklch(0.2 0.012 265);
  --card:oklch(1 0 0);--primary:oklch(0.22 0.014 265);--primary-foreground:oklch(0.985 0.002 265);
  --secondary:oklch(0.962 0.004 265);--muted:oklch(0.962 0.004 265);--muted-foreground:oklch(0.51 0.017 265);
  --accent:oklch(0.948 0.006 265);--destructive:oklch(0.56 0.21 27);--border:oklch(0.918 0.005 265);
  --input:oklch(0.89 0.007 265);--ring:oklch(0.68 0.015 265);--selection:oklch(0.9 0.02 265);--scrollbar:oklch(0.86 0.008 265);
  --sidebar:oklch(0.978 0.003 265);--sidebar-accent:oklch(0.935 0.007 265);
  --mint:#0d9373;--mint-strong:#0b7d62;--mint-soft:#e7f6f1;--mint-line:#bfe6d9;--live:#16a34a;
  --radius:0.625rem;--shadow:0 1px 2px oklch(0.2 0.012 265/0.04),0 4px 16px -6px oklch(0.2 0.012 265/0.08);
  --sans:Geist,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --mono:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --background:oklch(0.145 0 0);--canvas:oklch(0.17 0 0);--foreground:oklch(0.985 0 0);--card:oklch(0.205 0 0);
  --primary:oklch(0.922 0 0);--primary-foreground:oklch(0.205 0 0);--secondary:oklch(0.269 0 0);--muted:oklch(0.269 0 0);
  --muted-foreground:oklch(0.708 0 0);--accent:oklch(0.269 0 0);--destructive:oklch(0.704 0.191 22.216);
  --border:oklch(1 0 0/10%);--input:oklch(1 0 0/15%);--ring:oklch(0.556 0 0);--selection:oklch(0.35 0.02 265);--scrollbar:oklch(0.35 0 0);
  --sidebar:oklch(0.205 0 0);--sidebar-accent:oklch(0.269 0 0);
  --mint:#34c39b;--mint-strong:#5ad6b2;--mint-soft:oklch(0.3 0.05 170);--mint-line:oklch(0.42 0.07 170);
  --shadow:0 1px 2px #0006;color-scheme:dark;
}}
*,*:before,*:after{box-sizing:border-box}[hidden]{display:none!important}
html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-rendering:optimizeLegibility}
body{margin:0;min-width:320px;background:var(--background);color:var(--foreground);font:14px/1.5 var(--sans)}
button,input,select,textarea{font:inherit;color:inherit;caret-color:var(--foreground)}
::selection{background:var(--selection);color:var(--foreground)}
*{scrollbar-color:var(--scrollbar) transparent;scrollbar-width:thin}
a{color:inherit;text-underline-offset:3px}
h1,h2,h3{margin:0;font-weight:600;letter-spacing:-.015em}
h1{font-size:20px}h2{font-size:15px}h3{font-size:13px}
p{margin:0}
.mono{font-family:var(--mono)}.muted{color:var(--muted-foreground)}.small{font-size:12.5px}.xs{font-size:12px}
.truncate{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tnum{font-variant-numeric:tabular-nums}.grow{flex:1;min-width:0}
.hstack{display:flex;align-items:center;gap:8px}.wrap{flex-wrap:wrap}.vstack{display:flex;flex-direction:column;gap:12px}
.ic{width:16px;height:16px;flex-shrink:0}.ic-sm{width:14px;height:14px}.ic-xs{width:12px;height:12px}
:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in oklch,var(--ring) 50%,transparent)}

/* buttons (shadcn Button) */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 10px;border-radius:8px;border:1px solid transparent;background:var(--primary);color:var(--primary-foreground);font-size:13px;font-weight:500;white-space:nowrap;cursor:pointer;text-decoration:none;transition:background .15s,color .15s,border-color .15s;user-select:none}
.btn:hover{background:color-mix(in oklch,var(--primary) 80%,transparent)}.btn:active{transform:translateY(1px)}
.btn.outline{background:var(--background);border-color:var(--border);color:var(--foreground)}.btn.outline:hover{background:var(--muted)}
.btn.secondary{background:var(--secondary);color:var(--foreground)}.btn.secondary:hover{background:color-mix(in oklch,var(--secondary),var(--foreground) 5%)}
.btn.ghost{background:transparent;color:var(--foreground)}.btn.ghost:hover{background:var(--muted)}
.btn.destructive{background:color-mix(in oklch,var(--destructive) 10%,transparent);color:var(--destructive)}.btn.destructive:hover{background:color-mix(in oklch,var(--destructive) 18%,transparent)}
.btn.mint{background:var(--mint);color:#fff}.btn.mint:hover{background:var(--mint-strong)}
.btn.sm{height:28px;padding:0 9px;font-size:12.5px;border-radius:7px}.btn.xs{height:24px;padding:0 7px;font-size:12px;border-radius:6px;gap:4px}
.btn.icon{width:32px;padding:0}.btn.icon.sm{width:28px}.btn.icon.xs{width:24px}
.btn.muted-text{color:var(--muted-foreground)}.btn.muted-text:hover{color:var(--foreground)}
form.inline{display:inline-flex}

/* inputs */
.input,.select{height:32px;width:100%;min-width:0;border:1px solid var(--input);background:transparent;border-radius:8px;padding:0 10px;font-size:13px;transition:border-color .15s}
.input::placeholder{color:var(--muted-foreground)}.input:focus-visible,.select:focus-visible{border-color:var(--ring)}
.select{appearance:none;padding-right:28px;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;background-size:14px}
.field{display:flex;flex-direction:column;gap:6px}.field>label{font-size:12.5px;font-weight:500}
.search{position:relative}.search .ic{position:absolute;left:9px;top:50%;transform:translateY(-50%);color:var(--muted-foreground);pointer-events:none}
.search .input{padding-left:30px;background:color-mix(in oklch,var(--muted) 50%,transparent);height:34px}.search .input:focus-visible{background:var(--background)}

/* badges */
.badge{display:inline-flex;align-items:center;gap:4px;height:20px;padding:0 7px;border-radius:999px;border:1px solid transparent;font-size:11.5px;font-weight:500;white-space:nowrap}
.badge.secondary{background:var(--secondary);color:var(--foreground)}.badge.outline{border-color:var(--border);color:color-mix(in oklch,var(--foreground) 75%,transparent)}
.badge.code{font-family:var(--mono);font-weight:600;font-size:12px;letter-spacing:.04em;background:var(--mint-soft);color:var(--mint-strong);border-color:var(--mint-line);border-radius:6px}
.badge.live{background:color-mix(in oklch,var(--live) 12%,transparent);color:var(--live)}
.dot{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}
.pulse{animation:pulse 1.8s ease-in-out infinite}@keyframes pulse{50%{opacity:.35}}
kbd{display:inline-flex;align-items:center;height:20px;padding:0 5px;border:1px solid var(--border);border-radius:4px;background:var(--background);font:11px var(--sans);color:var(--muted-foreground)}

/* cards, alerts */
.card{background:var(--card);border-radius:14px;box-shadow:0 0 0 1px color-mix(in oklch,var(--foreground) 10%,transparent);overflow:hidden}
.card-body{padding:16px}.card-head{padding:14px 16px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
.card-title{font-size:14px;font-weight:600}.card-desc{font-size:12.5px;color:var(--muted-foreground);margin-top:2px}
.alert{border:1px solid var(--mint-line);background:var(--mint-soft);border-radius:12px;padding:12px 14px;font-size:13px;display:flex;flex-direction:column;gap:8px}
.alert.error{border-color:color-mix(in oklch,var(--destructive) 30%,transparent);background:color-mix(in oklch,var(--destructive) 6%,transparent)}
.alert-title{font-weight:600}
pre,.codeblock{margin:0;white-space:pre-wrap;word-break:break-word;font:12.5px/1.6 var(--mono);background:var(--muted);border:1px solid var(--border);border-radius:10px;padding:10px 12px;max-height:60vh;overflow:auto}
.sep{height:1px;background:var(--border);border:0;margin:0}

/* app shell (mailroom: sidebar | list | reader) */
.app{display:flex;height:100dvh;min-height:560px;overflow:hidden}
.sidebar{width:248px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--border);background:var(--sidebar)}
.sb-head{height:56px;display:flex;align-items:center;gap:10px;padding:0 16px;flex-shrink:0}
.brand{display:flex;align-items:center;gap:9px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:-.01em}
.brand-mark{width:22px;height:22px;flex-shrink:0}
.sb-new{padding:0 12px 8px}.sb-new .btn{width:100%;justify-content:flex-start;height:34px;gap:9px}.sb-new .btn[aria-current=page]{background:var(--sidebar-accent)}
.sb-search{padding:4px 12px 8px}
.sb-nav{flex:1;min-height:0;overflow-y:auto;padding:4px 8px 16px}
.sb-label{padding:14px 10px 6px;font-size:11.5px;font-weight:500;color:var(--muted-foreground)}
.sb-item{display:flex;align-items:center;gap:10px;height:32px;padding:0 10px;border-radius:6px;font-size:13px;text-decoration:none;color:color-mix(in oklch,var(--foreground) 80%,transparent);transition:background .12s}
.sb-item:hover{background:color-mix(in oklch,var(--sidebar-accent) 60%,transparent);color:var(--foreground)}
.sb-item[aria-current=page]{background:var(--sidebar-accent);color:var(--foreground);font-weight:500}
.sb-item .ic{color:var(--muted-foreground)}.sb-item[aria-current=page] .ic,.sb-item:hover .ic{color:var(--foreground)}
.sb-item .count{margin-left:auto;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.sb-item.addr{font-family:var(--mono);font-size:12.5px}
.sb-group{margin-left:17px;border-left:1px solid var(--border);padding-left:7px;display:flex;flex-direction:column;gap:1px}
.sb-empty{padding:6px 10px;font-size:12.5px;color:var(--muted-foreground)}
.sb-foot{flex-shrink:0;border-top:1px solid var(--border);padding:8px;display:flex;flex-direction:column;gap:1px}
.main{flex:1;min-width:0;display:flex;overflow:hidden}
.mobile-bar{display:none}

.list{width:380px;flex-shrink:0;display:flex;flex-direction:column;border-right:1px solid var(--border);background:var(--background)}
.list-head{border-bottom:1px solid var(--border);padding:14px 16px 12px;display:flex;flex-direction:column;gap:8px;flex-shrink:0}
.list-title{display:flex;align-items:center;gap:8px;min-height:28px}
.list-title h1{font-size:15px}
.list-meta{font-size:12px;color:var(--muted-foreground);display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.list-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.item{display:flex;flex-direction:column;gap:2px;padding:12px 16px;border-bottom:1px solid color-mix(in oklch,var(--border) 70%,transparent);text-decoration:none;color:inherit;position:relative;transition:background .12s}
.item:hover{background:color-mix(in oklch,var(--muted) 55%,transparent)}
.item[aria-current=true]{background:var(--accent)}
.item-top{display:flex;align-items:baseline;gap:8px}
.item-from{font-size:13px;font-weight:600}.item-time{margin-left:auto;font-size:12px;color:var(--muted-foreground);font-variant-numeric:tabular-nums;flex-shrink:0}
.item-subj{font-size:13px;color:color-mix(in oklch,var(--foreground) 85%,transparent)}
.item-to{font-size:11.5px;color:var(--muted-foreground);font-family:var(--mono)}
.item-tags{display:flex;align-items:center;gap:6px;margin-top:5px;flex-wrap:wrap}
.item-tags .xs{color:var(--muted-foreground);display:inline-flex;align-items:center;gap:4px}

.reader{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--canvas);overflow:hidden}
.reader-head{min-height:64px;flex-shrink:0;display:flex;align-items:center;gap:12px;padding:10px 24px;border-bottom:1px solid var(--border);background:var(--background)}
.reader-head h2{font-size:15px}
.reader-meta{font-size:12px;color:var(--muted-foreground);display:flex;align-items:center;gap:6px;min-width:0;margin-top:2px}
.reader-meta>*{flex-shrink:0;white-space:nowrap}.reader-meta>.truncate{flex-shrink:1}
.reader-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.reader-inner{max-width:820px;padding:20px 24px 32px;display:flex;flex-direction:column;gap:12px}
.extract{display:grid;gap:1px;background:var(--border);border-radius:14px;overflow:hidden;box-shadow:var(--shadow);border:1px solid var(--border)}
.extract>div{background:var(--card);padding:12px 16px;display:flex;align-items:center;gap:12px;min-width:0}
.extract-label{font-size:11.5px;font-weight:500;color:var(--muted-foreground);width:118px;flex-shrink:0;display:flex;align-items:center;gap:6px}
.code-value{font:600 26px/1.2 var(--mono);letter-spacing:.12em;color:var(--foreground)}
.link-value{font:12.5px var(--mono);color:var(--mint-strong);text-decoration:none}.link-value:hover{text-decoration:underline}
.toolbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.mail-frame{background:#fff;border-radius:14px;box-shadow:0 0 0 1px color-mix(in oklch,var(--foreground) 10%,transparent),var(--shadow);overflow:hidden}
.mail-frame iframe{display:block;width:100%;height:70vh;min-height:420px;border:0;background:#fff}
.mail-frame pre{border:0;border-radius:0;background:var(--card);max-height:none}
details.more>summary{cursor:pointer;font-size:12.5px;color:var(--muted-foreground);list-style:none;display:inline-flex;align-items:center;gap:6px}
details.more>summary::-webkit-details-marker{display:none}details.more>summary:hover{color:var(--foreground)}
details.more[open]>summary{margin-bottom:8px}
.more-list{display:flex;flex-direction:column;gap:4px;font-size:12.5px}
.more-list a{font-family:var(--mono);color:var(--mint-strong);overflow-wrap:anywhere;text-decoration:none}.more-list a:hover{text-decoration:underline}

.empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 24px 64px;gap:4px}
.empty-icon{width:44px;height:44px;border-radius:50%;border:1px solid var(--border);background:var(--background);display:flex;align-items:center;justify-content:center;color:var(--muted-foreground);margin-bottom:8px}
.empty-title{font-size:13px;font-weight:500}.empty-desc{font-size:12.5px;color:var(--muted-foreground);max-width:300px;line-height:1.5}
.list-empty{padding:40px 24px;text-align:center;font-size:12.5px;color:var(--muted-foreground)}

/* settings-style pages (keys, connect, new inbox) */
.page{flex:1;min-width:0;overflow-y:auto;background:var(--canvas)}
.page-inner{max-width:760px;margin:0 auto;padding:32px 24px 64px;display:flex;flex-direction:column;gap:20px}
.page-head{display:flex;flex-direction:column;gap:4px}.page-head p{color:var(--muted-foreground);font-size:13px}
.section-title{font-size:13px;font-weight:600;margin:8px 0 -8px}
.grid-form{display:grid;grid-template-columns:1.4fr auto 1fr;gap:10px;align-items:end}
.grid-form .at{padding-bottom:7px;color:var(--muted-foreground);font-family:var(--mono)}
.form-row{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.form-row .field{flex:1;min-width:160px}
table.tbl{width:100%;border-collapse:collapse;font-size:13px}
.tbl th{text-align:left;font-size:12px;font-weight:500;color:var(--muted-foreground);padding:10px 16px;border-bottom:1px solid var(--border)}
.tbl td{padding:12px 16px;border-bottom:1px solid color-mix(in oklch,var(--border) 70%,transparent);vertical-align:middle}
.tbl tr:last-child td{border-bottom:0}.tbl tr.revoked td{opacity:.5}

/* share page header */
.share-bar{height:56px;flex-shrink:0;display:flex;align-items:center;gap:12px;padding:0 16px;border-bottom:1px solid var(--border);background:var(--background)}
.share-shell{display:flex;flex-direction:column;height:100dvh;min-height:560px}
.share-shell .main{flex:1;min-height:0}

/* agent-socket connect */
[data-socket][data-state=live] [data-status]{color:var(--live);font-weight:500}
[data-log]{font:12px/1.6 var(--mono);color:var(--muted-foreground);max-height:180px;overflow:auto;margin:0;padding-left:18px}
[data-log]:empty{display:none}

@media (max-width:1100px){.list{width:320px}}
@media (max-width:860px){
  .app{height:auto;min-height:100dvh;flex-direction:column;overflow:visible}
  .sidebar{display:none}
  .mobile-bar{display:flex;align-items:center;gap:4px;height:52px;padding:0 10px 0 14px;border-bottom:1px solid var(--border);background:var(--background);position:sticky;top:0;z-index:5}
  .mobile-bar .brand{margin-right:auto}
  .main{flex-direction:column;overflow:visible}
  .list{width:auto;border-right:0}.list-body{overflow:visible}
  .reader{min-height:70vh}.reader-head{padding:10px 16px}.reader-inner{padding:16px}
  .main[data-view=reader] .list{display:none}.main[data-view=list] .reader{display:none}
  .page{overflow:visible}.page-inner{padding:20px 16px 48px}
  .grid-form{grid-template-columns:1fr}.grid-form .at{display:none}
  .share-shell{height:auto}
  .extract-label{width:auto}.extract>div{flex-wrap:wrap}
}
@media (min-width:861px){.back-link{display:none}}
`;

/** Client JS: copy buttons, two-step confirm, and live refresh via the long-poll endpoint. */
export const JS = `
function setLabel(el, text) {
  const target = el.querySelector("[data-label]") || el;
  const before = target.textContent;
  target.textContent = text;
  return before;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy]");
  if (!b) return;
  e.preventDefault();
  navigator.clipboard.writeText(b.getAttribute("data-copy")).then(() => {
    const before = setLabel(b, "Copied");
    b.setAttribute("data-copied", "");
    setTimeout(() => { setLabel(b, before); b.removeAttribute("data-copied"); }, 1200);
  });
});
// Two-step confirm without a native dialog (dialogs block agent-driven browsers):
// the first submit arms the button for 5 s, the second one goes through.
document.addEventListener("submit", (e) => {
  const form = e.target;
  const msg = form.getAttribute("data-confirm");
  if (!msg || form.dataset.armed === "1") return;
  e.preventDefault();
  const button = form.querySelector("button");
  form.dataset.armed = "1";
  const before = button ? setLabel(button, "Click again to confirm") : "";
  if (button) button.title = msg;
  setTimeout(() => { form.dataset.armed = ""; if (button) setLabel(button, before); }, 5000);
});
const live = document.querySelector("[data-wait]");
if (live) {
  const url = live.getAttribute("data-wait");
  (async function loop() {
    for (;;) {
      try {
        const r = await fetch(url, { headers: { accept: "application/json" } });
        // data-next: where to go on new mail. Pages rendered as a POST response (inbox just
        // created) must navigate, not reload, or the browser asks to resubmit the form.
        if (r.ok) { const j = await r.json(); if (j.message || j.changed) { location.replace(live.getAttribute("data-next") || location.href); return; } }
        else await new Promise((r) => setTimeout(r, 5000));
      } catch { await new Promise((r) => setTimeout(r, 5000)); }
    }
  })();
}
`;

/** Content hash for asset URLs, so a deploy never serves pages with stale cached CSS/JS. */
function contentHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const ASSET_VERSION = contentHash(CSS + JS);

// ---------- icons (paths from Lucide, ISC license; see NOTICE) ----------

const ICONS = {
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
  plug: '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon(props: { name: IconName; size?: "sm" | "xs" }) {
  return (
    <svg
      class={props.size ? `ic ic-${props.size}` : "ic"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {raw(ICONS[props.name])}
    </svg>
  );
}

/** The mark: an envelope whose flap is a mint leaf. */
export function BrandMark() {
  return (
    <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="3.5" width="22" height="17" rx="5" fill="var(--foreground)" />
      <path d="M5 8.2 12 13l7-4.8" fill="none" stroke="var(--background)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="18.6" cy="16.2" r="2.4" fill="var(--mint)" />
    </svg>
  );
}

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="1" y="3.5" width="22" height="17" rx="5" fill="#1d1f24"/><path d="M5 8.2 12 13l7-4.8" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="18.6" cy="16.2" r="2.4" fill="#0d9373"/></svg>',
  );

export function Head(props: { title: string; noReferrer?: boolean }) {
  return (
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      {props.noReferrer ? <meta name="referrer" content="no-referrer" /> : null}
      <title>{props.title} · mailmint</title>
      <link rel="icon" href={FAVICON} />
      <link rel="preload" href="/assets/fonts/geist.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
      <link rel="stylesheet" href={`/assets/app.css?v=${ASSET_VERSION}`} />
      <script src={`/assets/app.js?v=${ASSET_VERSION}`} defer></script>
    </head>
  );
}

/** Public pages (share links, errors): no owner chrome, no referrer. */
export function Layout(props: { title: string; children: Child }) {
  return (
    <html lang="en">
      <Head title={props.title} noReferrer />
      <body>{props.children}</body>
    </html>
  );
}

export function CopyButton(props: { value: string; label?: string; size?: "sm" | "xs"; variant?: string; title?: string }) {
  const size = props.size ?? "sm";
  return (
    <button
      type="button"
      class={`btn ${props.variant ?? "outline"} ${size}${props.label ? "" : " icon"}`}
      data-copy={props.value}
      title={props.title ?? "Copy"}
      aria-label={props.title ?? "Copy"}
    >
      <Icon name="copy" size={size === "xs" ? "xs" : "sm"} />
      {props.label ? <span data-label>{props.label}</span> : null}
    </button>
  );
}

export function CodeBadge(props: { code: string }) {
  return <span class="badge code">{props.code}</span>;
}

/** A share link or key shown once, with a copy button. */
export function SecretRow(props: { value: string; href?: boolean }) {
  return (
    <div class="hstack" style="min-width:0">
      {props.href ? (
        <a class="link-value truncate grow" href={props.value} target="_blank" rel="noopener noreferrer">
          {props.value}
        </a>
      ) : (
        <span class="mono truncate grow" style="font-size:12.5px">
          {props.value}
        </span>
      )}
      <CopyButton value={props.value} label="Copy" />
    </div>
  );
}

export function EmptyState(props: { icon: IconName; title: string; children?: Child }) {
  return (
    <div class="empty-state">
      <span class="empty-icon">
        <Icon name={props.icon} />
      </span>
      <p class="empty-title">{props.title}</p>
      {props.children ? <p class="empty-desc">{props.children}</p> : null}
    </div>
  );
}

export function LiveBadge(props: { url: string; next?: string; label: string }) {
  return (
    <span class="badge live" data-wait={props.url} data-next={props.next} title="Updates as soon as mail arrives">
      <span class="dot pulse"></span>
      {props.label}
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
    `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ${AGENT_SOCKET_RELAY} ${AGENT_SOCKET_RELAY.replace(/^https:/, "wss:")}; frame-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
};
