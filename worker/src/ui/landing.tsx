// The landing page served at `/` to browsers (agents get /agents.md markdown instead, see index.tsx).
// A full document of its own, in the style of agentsocket.dev: a contents rail, one reading column,
// framed figures. Fig 1 is built ahead of time by landing/build.mjs (landing-figure.ts) and moved by
// landing.client.js. Every claim here should stay true of the code; when in doubt, read the code.

import { raw } from "hono/html";
import { FIGURE_CSS, FIGURE_DATA, FIGURE_SVG } from "./landing-figure.ts";
import landingJs from "./landing.client.js";

const REPO = "https://github.com/blitzdotdev/mailmint";
const NPM = "https://www.npmjs.com/package/mailmint";
const blob = (path: string) => `${REPO}/blob/master/${path}`;

export interface LandingProps {
  origin: string;
  domain: string;
  acceptUnknown: boolean;
  defaultTtlHours: number;
  autoTtlHours: number;
}

// ── styles ───────────────────────────────────────────────────────────────
const PAGE_CSS = `
@font-face{font-family:Inter;src:url(/assets/fonts/inter.woff2) format("woff2");font-weight:100 900;font-display:swap}
@font-face{font-family:Newsreader;src:url(/assets/fonts/newsreader-italic.woff2) format("woff2");font-style:italic;font-weight:400 500;font-display:swap}
:root{
  --sans:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --serif:Newsreader,Georgia,"Times New Roman",serif;
  --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  --page:#fcfcfb;--ink:#1d1d20;--text:#45454a;--muted:#8b8b90;--rule:#e7e7e4;--soft:#f4f4f2;
  --accent:#0d9373;--accent-hover:#0b7d62;--accent-soft:#e7f6f1;
  --col:600px;--wide:1000px;
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{color-scheme:light;-webkit-text-size-adjust:100%;scroll-padding-top:24px}
body{margin:0;background:var(--page);color:var(--text);font:15.5px/1.62 var(--sans);font-feature-settings:"cv11","ss01";-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:underline;text-decoration-color:#c9c9c6;text-underline-offset:3px;text-decoration-thickness:1px}
a:hover{text-decoration-color:var(--ink)}
em,.serif{font-family:var(--serif);font-style:italic;font-weight:400;font-size:1.06em;letter-spacing:-.005em}
strong,b{color:var(--ink);font-weight:550}
code{font:500 .86em/1 var(--mono);color:var(--ink)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:2px}

.layout{display:grid;grid-template-columns:minmax(24px,1fr) 190px 56px var(--col) minmax(24px,calc(var(--wide) - var(--col))) minmax(24px,1fr)}
.toc{grid-column:2;position:sticky;top:0;align-self:start;height:100vh;padding:58px 0 40px;font-size:13.5px;line-height:1.95}
.toc a{display:block;color:var(--muted);text-decoration:none}
.toc a:hover,.toc a[aria-current="true"]{color:var(--ink)}
.toc .brand{color:var(--ink);font-weight:550;margin-bottom:2px}
.toc .brand b{color:var(--accent);font-weight:550}
.toc .gap{height:22px}
main{grid-column:4/6;min-width:0;padding:56px 0 0}
main>*,section>*{max-width:var(--col)}
main>section{max-width:none}
main>.wide,section>.wide{max-width:var(--wide)}
@media (max-width:1180px){
  .layout{grid-template-columns:1fr min(var(--col),calc(100% - 40px)) 1fr}
  .toc{display:none}
  main{grid-column:2}
  main>.wide,section>.wide{max-width:none;margin-left:calc((min(var(--col),100vw - 40px) - min(var(--wide),100vw - 24px))/2);width:min(var(--wide),calc(100vw - 24px))}
}

.top{display:flex;align-items:baseline;justify-content:space-between;gap:16px;font-size:14px}
.top .name{color:var(--ink);font-weight:550}
.top .name span{color:var(--muted);font-weight:400}
.top nav{display:flex;gap:18px;color:var(--muted)}
.top nav a{text-decoration:none}
.top nav a:hover{color:var(--ink)}
h1{margin:40px 0 0;color:var(--ink);font-size:clamp(30px,4.4vw,40px);line-height:1.12;font-weight:600;letter-spacing:-.028em;text-wrap:balance}
h1 em{font-size:1.12em;letter-spacing:-.01em;color:var(--accent)}
.lede{margin:16px 0 0;font-size:17px;line-height:1.55;text-wrap:pretty}
.lede code{font-size:.84em}
.paths{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:26px 0 0}
.path{display:block;padding:14px 16px 15px;border:1px solid var(--rule);border-top:3px solid var(--accent);border-radius:10px;background:#fff;text-decoration:none;transition:border-color .2s,box-shadow .2s}
.path:hover{border-color:#cfcfcb;border-top-color:var(--accent);box-shadow:0 1px 0 #0000000a,0 6px 16px -10px #0000002a}
.path.quiet{border-top-color:var(--ink)}
.path b{display:flex;justify-content:space-between;color:var(--ink);font-weight:550;font-size:15px}
.path b::after{content:"→";color:var(--muted);font-weight:400;transition:transform .2s}
.path:hover b::after{transform:translateX(2px);color:var(--ink)}
.path span{display:block;margin-top:3px;font-size:13.5px;line-height:1.45;color:var(--muted)}
.meta{margin:18px 0 0;font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;column-gap:8px}
.meta span{white-space:nowrap}
.meta span+span::before{content:"·";margin-right:8px;color:#c4c4c0}
@media (max-width:560px){.paths{grid-template-columns:1fr}}

section{margin-top:84px}
.h{display:flex;align-items:baseline;justify-content:space-between;gap:16px;border-top:1px solid var(--rule);padding-top:14px}
h2{margin:0;color:var(--ink);font-size:21px;line-height:1.3;font-weight:600;letter-spacing:-.016em}
.h .n{color:var(--accent);background:var(--accent-soft);border-radius:20px;padding:1px 9px;font-size:12.5px;font-weight:550;font-variant-numeric:tabular-nums}
h3{margin:30px 0 0;color:var(--ink);font-size:15.5px;font-weight:600;letter-spacing:-.006em}
section p{margin:14px 0 0;text-wrap:pretty}
.points{margin:22px 0 0;padding:0;list-style:none;display:grid;gap:18px}
.points li{padding-left:22px;position:relative}
.points li::before{content:"";position:absolute;left:1px;top:.58em;width:7px;height:7px;border-radius:50%;background:var(--accent)}
.steps{margin:20px 0 0;padding:0;list-style:none;counter-reset:s;display:grid;gap:12px}
.steps li{counter-increment:s;display:grid;grid-template-columns:28px 1fr;align-items:baseline}
.steps li::before{content:counter(s);color:var(--accent);font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.note{margin-top:16px;padding:12px 14px;border-radius:8px;background:var(--soft);font-size:14px;line-height:1.55}
.chip{font:500 12.6px/1.4 var(--mono);padding:1px 6px;border:1px solid var(--rule);border-bottom-width:2px;border-radius:5px;background:#fff;color:var(--ink);white-space:nowrap}
.sidenote{font-size:13px;color:var(--muted)}

.iso{--anatomy-page:var(--page);--anatomy-card:#fcfcfb}
figure{margin:28px 0 0}
.iso-figure{margin:34px 0 0}
.iso-plate{border-radius:12px;box-shadow:0 0 0 1px var(--rule);background:var(--anatomy-card);padding:46px 22px 50px}
.iso-plate-corner{font-family:var(--sans)!important;font-size:12px!important;letter-spacing:0!important;text-transform:none!important}
.iso-plate-corner[data-corner="readout"]{max-width:62%;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:normal}
.iso-legend{font-size:13px;color:var(--muted);margin-top:12px;padding:0 4px}
.iso-legend .iso-caption{color:var(--text);font-size:13.5px}
.iso-legend .iso-caption b{color:var(--ink);font-weight:550}
.mm-send{position:absolute;left:20px;bottom:13px;z-index:1;appearance:none;font:550 12.5px/1 var(--sans);color:#fff;background:var(--accent);border:0;border-radius:7px;padding:7px 11px;cursor:pointer}
.mm-send:hover{background:var(--accent-hover)}
.mm-stage{position:relative}
@media (max-width:640px){
  .iso-plate{padding:42px 10px 66px}
  .iso-plate-corner[data-corner="readout"]{max-width:100%}
  .iso-plate:has([data-figure]){overflow:hidden}
  [data-figure] svg{width:118%;max-width:none;margin:-3% 0 -2% -9%}
  .iso-plate:has([data-figure]){padding-bottom:84px}
  .iso-plate-corner[data-corner="hint"]{display:none}
  .iso-plate-corner[data-corner="readout"]{bottom:40px}
  .mm-send{bottom:14px;left:12px}
}
@media (max-width:560px){
  .top .name span{display:none}
  .meta{display:block}
  .meta span{display:block}
  .meta span+span::before{content:none}
}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

.code{margin:22px 0 0;border:1px solid var(--rule);border-radius:10px;background:#fff;overflow:hidden}
.code .bar{display:flex;justify-content:space-between;gap:12px;padding:8px 14px;border-bottom:1px solid var(--rule);font-size:12.5px;color:var(--muted)}
.code pre{margin:0;padding:14px 16px 16px;overflow-x:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:12.6px/1.62 var(--mono);color:#2b2b30;tab-size:2}
.code .c{color:#9a9aa0}.code .s{color:#0f7b55}.code .k{color:#1a5fd6}.code .p{color:#9a9aa0;user-select:none}.code .o{color:var(--ink)}
.term{margin:34px 0 0}
.term .iso-plate{padding:46px 22px 24px}
.term pre{margin:0;padding:16px 18px;border-radius:10px;background:#18181b;color:#e6e6e8;overflow-x:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.7 var(--mono);box-shadow:0 1px 0 #ffffff14 inset,0 18px 40px -22px #0000005c}
.term .p{color:#7c7c84;user-select:none}.term .c{color:#7c7c84}.term .hl{color:#7ee0c0;font-weight:600}

table{width:100%;border-collapse:collapse;margin:18px 0 0;font-size:14px}
th,td{text-align:left;padding:8px 10px 8px 0;border-bottom:1px solid var(--rule);vertical-align:top}
th{color:var(--muted);font-weight:500;font-size:12.5px}
td:first-child{color:var(--ink);white-space:nowrap;font-weight:550}
.scroll{overflow-x:auto}

.cases{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:22px 0 0}
.case{padding:14px 16px 15px;border:1px solid var(--rule);border-radius:10px;background:#fff}
.case b{display:block;font-size:14.5px}
.case p{margin:4px 0 0;font-size:14px;line-height:1.5}
.case .who{display:inline-block;margin-top:9px;padding:0 8px;border-radius:20px;font-size:12px;font-weight:550;color:var(--accent);background:var(--accent-soft)}
@media (max-width:560px){.cases{grid-template-columns:1fr}}

details{border-top:1px solid var(--rule);padding:12px 0}
details:last-of-type{border-bottom:1px solid var(--rule)}
summary{cursor:pointer;color:var(--ink);font-weight:550;list-style:none;display:flex;justify-content:space-between;gap:12px}
summary::after{content:"+";color:var(--muted);font-weight:400}
details[open] summary::after{content:"–"}
summary::-webkit-details-marker{display:none}
details p{margin:8px 0 0;font-size:14.5px}

.install{margin:24px 0 0;padding:18px 20px;border-radius:12px;background:#fff;border:1px solid var(--rule);border-left:3px solid var(--accent)}
.install .steps{margin-top:10px}
.install p{margin:6px 0 0}

footer{margin:96px 0 0;padding:18px 0 56px;border-top:1px solid var(--rule);font-size:13px;color:var(--muted);display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:space-between}
footer a{text-decoration:none}
footer a:hover{color:var(--ink)}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
`;

export const LANDING_CSS = FIGURE_CSS + PAGE_CSS;
export const LANDING_JS = landingJs;

/** Content hash for asset URLs (as in layout.tsx), so a deploy never pairs a page with stale CSS/JS. */
function contentHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const CSS_VERSION = contentHash(LANDING_CSS);
const JS_VERSION = contentHash(LANDING_JS);

// ── helpers ──────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** `168` → "7 days", `24` → "24 hours", `1` → "1 hour". */
function hoursText(hours: number): string {
  if (hours % 24 === 0 && hours > 24) return `${hours / 24} days`;
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * A code card. Lines are written with light markup: `#…` to the end of a line is a comment,
 * `$ ` at the start is a prompt, and «…» marks a string. Everything else is escaped.
 */
function codeHtml(lines: string[]): string {
  return lines
    .map((line) => {
      let out = "";
      let rest = line;
      if (rest.startsWith("$ ")) {
        out += `<span class="p">$ </span>`;
        rest = rest.slice(2);
      }
      const hash = rest.search(/(^|\s)# /);
      const body = hash < 0 ? rest : rest.slice(0, hash);
      const comment = hash < 0 ? "" : rest.slice(hash);
      out += esc(body).replace(/«(.*?)»/g, '<span class="s">$1</span>');
      if (comment) out += `<span class="c">${esc(comment)}</span>`;
      return out;
    })
    .join("\n");
}

function Code(props: { title: string; note?: string; lines: string[]; label: string }) {
  return (
    <div class="code" role="group" aria-label={props.label}>
      <div class="bar">
        <span>{props.title}</span>
        {props.note ? <span>{props.note}</span> : null}
      </div>
      <pre>{raw(codeHtml(props.lines))}</pre>
    </div>
  );
}

function Section(props: { id: string; n: number; title: string; children: unknown }) {
  return (
    <section id={props.id} aria-labelledby={`h-${props.id}`}>
      <div class="h">
        <h2 id={`h-${props.id}`}>{props.title}</h2>
        <span class="n">{String(props.n).padStart(2, "0")}</span>
      </div>
      {props.children}
    </section>
  );
}

const TOC: [string, string][] = [
  ["different", "What's different"],
  ["how", "How it works"],
  ["ways", "Ways in"],
  ["uses", "What it's for"],
  ["security", "Security"],
  ["self-host", "Self-host"],
  ["questions", "Questions"],
  ["install", "Install"],
];

// ── the page ─────────────────────────────────────────────────────────────
export function LandingPage(props: LandingProps) {
  const { origin } = props;
  const domain = props.domain || "example.com";
  const sampleName = "quiet-otter-4k7m";
  const sample = `${sampleName}@${domain}`;
  const anyAddress = props.acceptUnknown;
  const figureData = JSON.stringify({ ...FIGURE_DATA, address: sample, reduced: false });

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>mailmint: disposable email that waits for the code</title>
        <meta
          name="description"
          content="Self-hosted disposable inboxes on your own Cloudflare account. Codes and links are extracted as mail arrives, and one call waits for them, for people and for AI agents."
        />
        <link rel="preload" href="/assets/fonts/inter.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
        <link
          rel="icon"
          href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect x=%223%22 y=%226%22 width=%2226%22 height=%2220%22 rx=%224%22 fill=%22%231d1d20%22/%3E%3Cpath d=%22M6 10l10 7 10-7%22 fill=%22none%22 stroke=%22%230d9373%22 stroke-width=%222.6%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E"
        />
        <link rel="stylesheet" href={`/assets/landing.css?v=${CSS_VERSION}`} />
        <script type="module" src={`/assets/landing.js?v=${JS_VERSION}`}></script>
      </head>
      <body class="iso" data-theme="light">
        <div class="layout">
          <nav class="toc" aria-label="Contents">
            <a class="brand" href="#top">
              mail<b>mint</b>
            </a>
            <a href="/admin">Dashboard</a>
            <a href={REPO}>GitHub</a>
            <div class="gap"></div>
            {TOC.map(([id, label]) => (
              <a href={`#${id}`}>{label}</a>
            ))}
          </nav>
          <main id="top">
            <div class="top">
              <div class="name">
                mailmint <span>· disposable email for sign-up tests</span>
              </div>
              <nav aria-label="Site">
                <a href="#install">Install</a>
                <a href="/agents.md">agents.md</a>
                <a href={REPO}>GitHub</a>
              </nav>
            </div>

            <h1>
              Disposable email that <em>waits</em> for the code.
            </h1>
            <p class="lede">
              mailmint runs on your own Cloudflare account. {anyAddress ? <>Mail to any address at </> : <>Mail to the inboxes you create at </>}
              <b>{domain}</b> lands in an inbox, the verification code or link is pulled out the moment it arrives, and
              one call blocks until it does. A person or an AI agent gets through a sign-up flow in two steps.
            </p>
            <div class="paths">
              <a class="path" href="#ways">
                <b>Use it from a terminal or an agent</b>
                <span>
                  <code>npx mailmint new</code>, then <code>npx mailmint wait --code</code>. Or REST, MCP, or a link any AI chat can use.
                </span>
              </a>
              <a class="path quiet" href="/admin">
                <b>Open the dashboard</b>
                <span>Every inbox, the latest mail with its codes, API keys and agent links. Behind Cloudflare Access.</span>
              </a>
            </div>
            <p class="meta">
              <span>Open source, Apache 2.0</span>
              <span>Runs on your Cloudflare account</span>
              <span>Mail stays in your D1 and R2</span>
            </p>

            <div class="wide">
              <figure class="iso-figure">
                <div class="iso-plate">
                  <div class="iso-plate-corners" aria-hidden="true">
                    <span class="iso-plate-corner" data-corner="fig">
                      Fig 1
                    </span>
                    <span class="iso-plate-corner" data-corner="title">
                      One email, from the slot to the code
                    </span>
                    <span class="iso-plate-corner" data-corner="hint" data-hint></span>
                    <span class="iso-plate-corner" data-corner="readout" data-readout>
                      {`${sample} · code 482913`}
                    </span>
                  </div>
                  <button type="button" class="mm-send" data-send hidden>
                    Send a test email
                  </button>
                  <div
                    class="mm-stage"
                    data-figure={figureData}
                    tabindex={0}
                    role="group"
                    aria-label="Fig 1, interactive. Press Enter, or click the intake box's slot, to send a test email through the bench."
                  >
                    {raw(FIGURE_SVG)}
                  </div>
                  <p class="sr" data-status aria-live="polite"></p>
                </div>
                <figcaption class="iso-legend">
                  <span class="iso-caption">
                    <b>One email, start to finish.</b> The intake box is the catch-all address; its drawer is R2, where
                    the raw <code>.eml</code> is filed first. The reader on the gantry parses the mail and pulls out the
                    code and link. The pigeonholes are D1, one per inbox. When the letter lands, the inbox's bell rings
                    (its Durable Object) and the waiting <code>wait</code> call on the console returns the code. The code
                    and address are an example.
                  </span>
                </figcaption>
              </figure>
            </div>

            <Section id="different" n={1} title="What's different">
              <p>
                Public throwaway inboxes (sharklasers, mail.tm, 10minutemail) are fine for a one-off by hand. They get in
                the way the moment a test suite or an AI agent has to sign up somewhere.
              </p>
              <ul class="points">
                <li>
                  <b>Your domain, not a blocklisted one.</b> Public disposable domains end up on the blocklists sign-up
                  forms check. mailmint receives mail on a domain you own and use only for this.
                </li>
                <li>
                  <b>Your account, not someone else's server.</b> One Worker on your Cloudflare account. Messages live in
                  your D1 database, raw mail and attachments in your R2 bucket.
                </li>
                <li>
                  <b>A call that waits for the code.</b> Codes and verification links are extracted when the mail
                  arrives, and <code>wait</code> holds the request open until a matching message lands. No polling loop,
                  no sleeps in your tests.
                </li>
                <li>
                  <b>Built for agents as well as people.</b> A CLI that prints just the code, markdown instructions at every
                  URL an agent might fetch, MCP with OAuth, and an agent-socket link for chats that only speak HTTP.
                </li>
              </ul>
            </Section>

            <Section id="how" n={2} title="How it works">
              <p>One Worker does everything. Here is one email, station by station, as in Fig 1:</p>
              <ol class="steps">
                <li>
                  <span>
                    <b>The catch-all hands it over.</b> Cloudflare Email Routing sends <code>*@{domain}</code> to the
                    Worker's <code>email()</code> handler.{" "}
                    {anyAddress
                      ? `An address nobody created becomes an inbox only the owner can see, expiring ${hoursText(props.autoTtlHours)} after its latest message.`
                      : "This instance is in strict mode: mail to an address nobody created is rejected."}
                  </span>
                </li>
                <li>
                  <span>
                    <b>The raw mail is filed.</b> The <code>.eml</code> and any attachments go to R2, so you can always
                    download exactly what was sent.
                  </span>
                </li>
                <li>
                  <span>
                    <b>The code and link are pulled out.</b> postal-mime parses the message and a scored extractor picks the
                    verification code and link, ignoring years, prices, phone and order numbers.
                  </span>
                </li>
                <li>
                  <span>
                    <b>It lands in its inbox.</b> The message, with its codes and links, is stored in D1. Mail to{" "}
                    <code>name+github@{domain}</code> lands in <code>name@{domain}</code>, tagged <code>github</code>.
                  </span>
                </li>
                <li>
                  <span>
                    <b>The waiting call wakes.</b> Each inbox has a Durable Object that holds open <code>wait</code>{" "}
                    requests. Storing the message signals it: the waiting requests wake at once, and each one whose filter
                    matches returns the message, <code>code</code> and <code>link</code> already filled in.
                  </span>
                </li>
              </ol>
              <p class="sidenote">
                The pipeline is <a href={blob("worker/src/email/receive.ts")}>worker/src/email/receive.ts</a>; the wait is{" "}
                <a href={blob("worker/src/signal.ts")}>worker/src/signal.ts</a>.
              </p>
            </Section>

            <Section id="ways" n={3} title="Ways in">
              <p>Every way in runs the same operations with the same rules. Pick the one that fits whoever is asking.</p>
              <div class="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Way in</th>
                      <th>For</th>
                      <th>Credential</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>CLI</td>
                      <td>Terminals and coding agents: <code>npx mailmint</code>, no dependencies</td>
                      <td>An API key, or a share link</td>
                    </tr>
                    <tr>
                      <td>REST</td>
                      <td>Scripts and test suites: <code>{origin}/v1</code></td>
                      <td>
                        <code>Bearer</code> API key
                      </td>
                    </tr>
                    <tr>
                      <td>Share link</td>
                      <td>One inbox, for another person or agent: <code>/i/&lt;token&gt;</code></td>
                      <td>The link is the key</td>
                    </tr>
                    <tr>
                      <td>MCP</td>
                      <td>MCP clients: <code>{origin}/mcp</code></td>
                      <td>OAuth; you approve each client</td>
                    </tr>
                    <tr>
                      <td>Any AI chat</td>
                      <td>claude.ai, ChatGPT or any chat that can make web requests</td>
                      <td>An agent-socket link, live while you keep it running</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3>From a terminal</h3>
              <Code
                title="shell"
                note="key from /admin/keys"
                label="Logging in, creating an inbox and waiting for the code with the CLI"
                lines={[
                  `$ npx mailmint login --url ${origin} --key mm_key_…`,
                  `$ addr=$(npx mailmint new)               # ${sample}`,
                  `# … use $addr in the sign-up form …`,
                  `$ code=$(npx mailmint wait "$addr" --code) # blocks until the code arrives`,
                ]}
              />
              <p>
                <code>--link</code> waits for a verification link instead. <code>--from</code>, <code>--subject</code> and{" "}
                <code>--tag</code> narrow what counts, <code>--since latest</code> ignores mail already there, and a timeout
                exits with code 2.
              </p>
              <div class="term">
                <figure>
                  <div class="iso-plate">
                    <div class="iso-plate-corners" aria-hidden="true">
                      <span class="iso-plate-corner" data-corner="fig">
                        Fig 2
                      </span>
                      <span class="iso-plate-corner" data-corner="title">
                        The CLI in an agent's shell
                      </span>
                    </div>
                    <pre aria-label="A terminal session: create an inbox, then wait for the code">
                      {raw(
                        [
                          `<span class="p">$ </span>npx mailmint new --label "acme sign-up"`,
                          esc(sample),
                          `<span class="c"># the agent submits the address in acme's sign-up form</span>`,
                          `<span class="p">$ </span>npx mailmint wait ${esc(sampleName)} --code --timeout 3m`,
                          `<span class="hl">482913</span>`,
                        ].join("\n"),
                      )}
                    </pre>
                  </div>
                  <figcaption class="iso-legend">
                    <span class="iso-caption">
                      <b>Fig 2.</b> <code>new</code> prints only the address and <code>wait --code</code> only the code,
                      so both drop straight into a script. The address and code are an example.
                    </span>
                  </figcaption>
                </figure>
              </div>

              <h3>Over HTTP</h3>
              <Code
                title="curl"
                note="API reference: /agents.md"
                label="Creating an inbox and waiting for its code over the REST API"
                lines={[
                  `$ MM=${origin}`,
                  `$ addr=$(curl -s -X POST $MM/v1/inboxes \\`,
                  `    -H «"Authorization: Bearer $MAILMINT_KEY"» | jq -r .address)`,
                  `$ curl -s -H «"Authorization: Bearer $MAILMINT_KEY"» \\`,
                  `    «"$MM/v1/inboxes/$addr/wait?extract=code"» | jq -r .message.code`,
                ]}
              />
              <p>
                <code>wait</code> returns <code>{`{message, timed_out, cursor}`}</code>; on a timeout, call again with{" "}
                <code>since=cursor</code>. Timeouts go up to 300 seconds per call.
              </p>

              <h3>A share link for one inbox</h3>
              <p>
                Every inbox you create comes with a capability URL. It opens that one inbox, live, in a browser, and serves
                an <code>agents.md</code> card to an agent, so you can hand an inbox to someone without giving them a key.
              </p>
              <Code
                title="curl"
                note="no API key"
                label="Waiting for a verification link through a share link"
                lines={[`$ curl -s «"${origin}/i/mm_in_…/wait?extract=link"» \\`, `    | jq -r .message.link`]}
              />

              <h3>MCP, or any AI chat</h3>
              <p>
                MCP clients connect to <code>{origin}/mcp</code> and sign in with OAuth; you approve each one. They get{" "}
                <code>create_inbox</code>, <code>list_inboxes</code>, <code>wait_for_email</code>,{" "}
                <code>list_messages</code>, <code>read_message</code> and <code>delete_inbox</code>.
              </p>
              <p>
                For a chat with no MCP, press <b>Create link</b> on <a href="/admin/connect">/admin/connect</a> (or run{" "}
                <code>mailmint connect</code>). You get an <a href="https://agentsocket.dev">agent-socket</a> link to paste
                into claude.ai, ChatGPT or any chat that can make web requests; it can create inboxes, wait and read mail
                with owner access until you press Stop or close the page.
              </p>
            </Section>

            <Section id="uses" n={4} title="What it's for">
              <div class="cases">
                <div class="case">
                  <b>An agent signs up for you</b>
                  <p>A coding agent makes an inbox, fills in the form in a browser, waits for the code and types it in. Nobody copies codes by hand.</p>
                  <div class="who">CLI · MCP</div>
                </div>
                <div class="case">
                  <b>End-to-end tests</b>
                  <p>A test makes an inbox over REST, signs up in your app, and asserts on the extracted link. It moves on the moment the mail lands.</p>
                  <div class="who">REST</div>
                </div>
                <div class="case">
                  <b>Magic links and resets</b>
                  <p>
                    <code>--link</code> returns the verification link instead of a code, for magic-link sign-in and password resets.
                  </p>
                  <div class="who">CLI · REST</div>
                </div>
                <div class="case">
                  <b>Many flows, one address</b>
                  <p>
                    Send to <code>name+github@</code> and <code>name+stripe@</code>, then wait with <code>--tag</code>; each flow sees only its own mail.
                  </p>
                  <div class="who">Plus addressing</div>
                </div>
                <div class="case">
                  <b>Hand an inbox to someone</b>
                  <p>Give a teammate or another agent one inbox's share link: a live page for people, agents.md for agents.</p>
                  <div class="who">Share link</div>
                </div>
                <div class="case">
                  <b>Check by hand</b>
                  <p>The dashboard lists every inbox with its latest mail and codes, and renders the HTML in a sandbox.</p>
                  <div class="who">Dashboard</div>
                </div>
              </div>
            </Section>

            <Section id="security" n={5} title="Security">
              <div class="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Who</th>
                      <th>Can</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>The owner</td>
                      <td>Everything. An API key, the dashboard behind Cloudflare Access, or an MCP client you approved.</td>
                    </tr>
                    <tr>
                      <td>A share-link holder</td>
                      <td>Read and delete one inbox.</td>
                    </tr>
                    <tr>
                      <td>Anyone who knows an address</td>
                      <td>Send it mail. Nothing else: an address is not a key.</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ul class="points">
                <li>
                  <b>Keys and tokens are stored as hashes.</b> 192 random bits each, kept only as SHA-256 digests. Failed
                  authentication is rate limited per IP.
                </li>
                <li>
                  <b>Email content is untrusted.</b> HTML renders under a sandbox CSP with no scripts and remote images off
                  until you ask, and only inside mailmint's own pages. Attachments always download. The agent docs and MCP
                  tool descriptions tell agents never to follow instructions found in mail.
                </li>
                <li>
                  <b>Share links don't leak.</b> Pages that carry a token send <code>Referrer-Policy: no-referrer</code>, so a
                  link clicked inside an email can't see it.
                </li>
                <li>
                  <b>Floods are capped.</b> Per-inbox, per-day and per-message-size limits are enforced at SMTP time.
                </li>
              </ul>
              <p class="sidenote">
                Out of scope: the owner can read all mail, and mail transits Cloudflare. Details in{" "}
                <a href={blob("SECURITY.md")}>SECURITY.md</a>.
              </p>
            </Section>

            <Section id="self-host" n={6} title="Self-host">
              <p>
                You need a domain on Cloudflare used only for this (catch-all routing works on apex domains only), Workers
                with R2 enabled, and Node 22.
              </p>
              <ol class="steps">
                <li>
                  <span>
                    Turn on <b>Email Routing</b> for the domain. Don't add rules; the deploy points the catch-all at the
                    Worker.
                  </span>
                </li>
                <li>
                  <span>
                    Create an API token with the scopes in the guide and put it in <code>.env</code>.
                  </span>
                </li>
                <li>
                  <span>
                    Create the D1 database, the R2 bucket and a KV namespace with <code>wrangler</code>.
                  </span>
                </li>
                <li>
                  <span>
                    Add a <b>Cloudflare Access</b> application for <code>/admin</code> and <code>/authorize</code>.
                  </span>
                </li>
                <li>
                  <span>
                    Fill in <code>worker/wrangler.jsonc</code>: the route, <code>MAIL_DOMAINS</code>, the Access audience and
                    the resource ids.
                  </span>
                </li>
                <li>
                  <span>
                    Run <code>bash scripts/deploy.sh deploy</code>: type-check, tests, migrations, deploy, catch-all, smoke
                    test.
                  </span>
                </li>
              </ol>
              <p class="sidenote">
                The full guide is <a href={blob("docs/self-host.md")}>docs/self-host.md</a>.
              </p>
            </Section>

            <Section id="questions" n={7} title="Questions">
              <div style="margin-top:14px">
                <details>
                  <summary>Does it send email?</summary>
                  <p>No. mailmint only receives. It's for the other end of a sign-up flow: the inbox the code goes to.</p>
                </details>
                <details>
                  <summary>Can I use my main domain?</summary>
                  <p>
                    Use one just for this. Catch-all routing works on apex domains only, Email Routing refuses a domain whose
                    MX records point elsewhere, and a separate domain keeps disposable-mail reputation away from your real
                    one.
                  </p>
                </details>
                <details>
                  <summary>How long is mail kept?</summary>
                  <p>
                    An inbox you create lives {hoursText(props.defaultTtlHours)} unless you pick another lifetime.
                    {anyAddress
                      ? ` Inboxes made by mail to an address nobody created expire ${hoursText(props.autoTtlHours)} after their latest message.`
                      : ""}{" "}
                    An hourly job deletes what has expired, along with its raw mail in R2.
                  </p>
                </details>
                <details>
                  <summary>How good is the code extraction?</summary>
                  <p>
                    It scores every candidate by the words around it, the layout and emphasis, and rejects things that look
                    like years, prices, dates, phone, order or tracking numbers and promo codes. The repo's test set has 52
                    emails: 47 synthetic ones modelled on common senders, including Chinese, Japanese, German and Spanish mail,
                    and 5 real sign-up emails with personal details removed. Up to five candidates are kept in{" "}
                    <code>codes</code>, for when the best guess is wrong.
                  </p>
                </details>
                <details>
                  <summary>What does it cost?</summary>
                  <p>
                    The code is free and open source under Apache 2.0. It runs on your own Cloudflare account; receiving works
                    on the Workers free plan, and R2 has to be enabled.
                  </p>
                </details>
                <details>
                  <summary>Can an agent use it without the CLI?</summary>
                  <p>
                    Yes. <a href="/agents.md">/agents.md</a> on this instance explains the HTTP API in markdown, and fetching{" "}
                    <code>/</code> without asking for HTML returns the same. A share link's own <code>agents.md</code> is
                    enough to use that inbox with no other setup.
                  </p>
                </details>
              </div>
            </Section>

            <Section id="install" n={8} title="Install">
              <div class="install">
                <b>The CLI</b>
                <ol class="steps">
                  <li>
                    <span>
                      <code>npx mailmint</code> runs it with nothing to install (Node 22.21 or newer), or{" "}
                      <code>npm i -g mailmint</code>. It's on <a href={NPM}>npm</a>.
                    </span>
                  </li>
                  <li>
                    <span>
                      Make an API key on <a href="/admin/keys">/admin/keys</a>.
                    </span>
                  </li>
                  <li>
                    <span>
                      <code>mailmint login --url {origin} --key mm_key_…</code>
                    </span>
                  </li>
                </ol>
              </div>
              <div class="install">
                <b>For Claude Code</b>
                <p>
                  Copy <a href={`${REPO}/tree/master/skills/mailmint`}>skills/mailmint</a> into <code>~/.claude/skills/</code>{" "}
                  and agents learn the workflow. This instance also serves a skill for its HTTP API at{" "}
                  <a href="/skill.md">/skill.md</a>.
                </p>
              </div>
              <div class="install">
                <b>Your own instance</b>
                <p>
                  Clone <a href={REPO}>the repo</a> and follow <a href={blob("docs/self-host.md")}>docs/self-host.md</a>.
                </p>
              </div>
            </Section>

            <footer>
              <span>
                mailmint · open source under Apache 2.0 · <a href={REPO}>GitHub</a> · <a href={NPM}>npm</a> ·{" "}
                <a href="/agents.md">agents.md</a>
              </span>
              <span>
                Figure drawn with <a href="https://github.com/wheresryan22/anatomy">anatomy</a> (MIT) · Inter and Newsreader
                (OFL)
              </span>
            </footer>
          </main>
        </div>
      </body>
    </html>
  );
}
