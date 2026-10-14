#!/usr/bin/env node
// README screenshots from a LOCAL dev instance seeded with demo mail (no real inboxes get photographed).
//
//   cd worker && npx wrangler d1 migrations apply DB --local --persist-to ../.trash/shots/state
//   npx wrangler dev --port 8851 --local-upstream localhost:8851 --persist-to ../.trash/shots/state \
//     --var MAIL_DOMAINS:example.com            # worker/.dev.vars must set DEV_BYPASS_ACCESS=1
//   SHOTS_URL=http://localhost:8851 node scripts/readme-screenshots.mjs
//
// Start from fresh state (seeding is not idempotent). Writes docs/images/*.png. Uses playwright-core with the system Chromium (CHROMIUM=/path overrides).
import { execFile, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.SHOTS_URL || "http://localhost:8787";
const outDir = join(root, "docs", "images");
mkdirSync(outDir, { recursive: true });

const form = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" },
    body: new URLSearchParams(body),
  });

const keyPage = await (await form("/admin/keys", { name: "readme" })).text();
const KEY = /mm_key_[A-Za-z0-9_-]{32}/.exec(keyPage)?.[0];
if (!KEY) throw new Error(`no key minted; is ${BASE} a dev instance with DEV_BYPASS_ACCESS=1?`);

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${KEY}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

let seq = 0;
function eml({ from, to, subject, text, html, attachment }) {
  const alt = `alt-${++seq}`;
  const body = [
    `--${alt}`, "Content-Type: text/plain; charset=utf-8", "", text,
    ...(html ? [`--${alt}`, "Content-Type: text/html; charset=utf-8", "", html] : []),
    `--${alt}--`,
  ];
  const head = [
    `From: ${from}`, `To: ${to}`, `Subject: ${subject}`,
    `Message-ID: <readme-${Date.now()}-${seq}@demo.example>`, `Date: ${new Date().toUTCString()}`, "MIME-Version: 1.0",
  ];
  if (!attachment) return [...head, `Content-Type: multipart/alternative; boundary="${alt}"`, "", ...body, ""].join("\r\n");
  const mix = `mix-${seq}`;
  return [
    ...head, `Content-Type: multipart/mixed; boundary="${mix}"`, "",
    `--${mix}`, `Content-Type: multipart/alternative; boundary="${alt}"`, "", ...body,
    `--${mix}`, `Content-Type: ${attachment.type}; name="${attachment.name}"`,
    `Content-Disposition: attachment; filename="${attachment.name}"`, "Content-Transfer-Encoding: base64", "",
    Buffer.from(attachment.data).toString("base64"), `--${mix}--`, "",
  ].join("\r\n");
}

async function deliver(to, mail) {
  const from = /<([^>]+)>/.exec(mail.from)?.[1] ?? mail.from;
  const res = await fetch(`${BASE}/cdn-cgi/handler/email?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
    method: "POST",
    headers: { "content-type": "message/rfc822" },
    body: eml({ ...mail, to }),
  });
  if (!res.ok) throw new Error(`deliver ${to}: ${res.status}`);
  await new Promise((r) => setTimeout(r, 250)); // distinct received_at, stable ordering
}

const button = (href, label) =>
  `<p><a href="${href}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${label}</a></p>`;

// Older mail first so the list reads newest-on-top.
const northwind = await api("POST", "/v1/inboxes", { label: "Northwind sign-up (staging)" });
await deliver(northwind.address, {
  from: "Northwind <hello@northwind.example>",
  subject: "Confirm your email address",
  text: "Welcome to Northwind!\n\nConfirm your email: https://app.northwind.example/verify?token=Qm9vdHN0cmFwLXRva2VuLWRlbW8\n\nUnsubscribe: https://northwind.example/unsubscribe",
  html: `<h2>Welcome to Northwind</h2><p>Confirm your email address to finish setting up your workspace.</p>${button("https://app.northwind.example/verify?token=Qm9vdHN0cmFwLXRva2VuLWRlbW8", "Confirm email")}<p style="color:#888;font-size:12px">Northwind, 221 Market St, Suite 400, CA 94105 · <a href="https://northwind.example/unsubscribe">Unsubscribe</a></p>`,
});
await deliver("ci-run-1842@example.com", {
  from: "Paperplane <noreply@paperplane.example>",
  subject: "Sign in to Paperplane",
  text: "Your sign-in code is 730 118. It expires in 10 minutes.",
  html: `<p>Your sign-in code is</p><p style="font-size:28px;letter-spacing:4px"><b>730 118</b></p><p>It expires in 10 minutes.</p>`,
});
const acme = await api("POST", "/v1/inboxes", { label: "Acme Cloud agent test" });
await deliver(acme.address, {
  from: "Acme Cloud <team@acme-cloud.example>",
  subject: "Welcome to Acme Cloud",
  text: "Thanks for trying Acme Cloud. Your trial runs until November 30, 2026. Plans start at $29/month.\n\nAcme Cloud, 500 Howard St, San Francisco CA 94105",
  html: `<h2>Thanks for trying Acme Cloud</h2><p>Your trial runs until November 30, 2026. Plans start at $29/month.</p><p>Your first invoice is attached.</p>`,
  attachment: { name: "invoice-0001.pdf", type: "application/pdf", data: "%PDF-1.4\n% demo invoice\n" },
});
await deliver(`${acme.address.replace("@", "+signup@")}`, {
  from: "Acme Cloud <no-reply@acme-cloud.example>",
  subject: "Your Acme Cloud verification code: 482913",
  text: "Your verification code is 482913.\n\nEnter it within 15 minutes to verify your email. Didn't request this? Ignore this email.\n\nOrder support: +1 (415) 555-0134",
  html: `<div style="font-family:system-ui;max-width:480px"><h2 style="margin:0 0 12px">Verify your email</h2><p>Enter this code in Acme Cloud to verify your email address:</p><p style="font-size:32px;font-weight:700;letter-spacing:6px;background:#f4f4f5;padding:12px 16px;border-radius:8px;display:inline-block">482913</p><p>The code expires in 15 minutes. Didn't request this? You can ignore this email.</p><p style="color:#888;font-size:12px">Support: +1 (415) 555-0134</p></div>`,
});

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/usr/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 2 });
async function shot(name, path, { full = false } = {}) {
  await page.goto(`${BASE}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: full });
  console.log(`docs/images/${name}.png  ← ${path}`);
}

// The landing page: hero + Fig 1, at the size a README shows it.
await page.setViewportSize({ width: 1280, height: 1330 });
await page.goto(`${BASE}/`, { waitUntil: "load" });
await page.waitForTimeout(1500);
await page.screenshot({ path: join(outDir, "landing.png") });
await page.setViewportSize({ width: 1200, height: 760 });
console.log("docs/images/landing.png  ← /");
await shot("dashboard", "/admin");
await shot("inbox", `/admin/inbox/${encodeURIComponent(acme.address)}`);
await shot("share-link", new URL(acme.url).pathname);
// Connect: mint a real agent-socket link, photograph the connected state, then Stop (the link dies).
await page.goto(`${BASE}/admin/connect`, { waitUntil: "load" });
await page.click("[data-start]");
await page.locator("[data-link]").filter({ hasText: /agents\.md/ }).waitFor({ timeout: 20_000 });
await page.screenshot({ path: join(outDir, "connect.png"), clip: await page.locator("[data-socket]").boundingBox().then((b) => ({ x: 0, y: 0, width: 1200, height: Math.ceil(b.y + b.height + 24) })) });
console.log("docs/images/connect.png  ← /admin/connect (connected, then stopped)");
await page.click("[data-stop]");

// The CLI: run the real commands against this instance, then render their output in a terminal frame.
const home = mkdtempSync(join(tmpdir(), "mm-shots-"));
const cli = (...argv) => {
  const r = spawnSync(process.execPath, [join(root, "cli", "bin", "mailmint.mjs"), ...argv], {
    env: { ...process.env, HOME: home, MAILMINT_URL: BASE, MAILMINT_KEY: KEY },
    encoding: "utf8",
  });
  return (r.stdout + r.stderr).trimEnd();
};
const addr = cli("new", "--label", "readme demo");
setTimeout(() => deliver(addr, {
  from: "Acme Cloud <no-reply@acme-cloud.example>",
  subject: "Your Acme Cloud verification code: 482913",
  text: "Your verification code is 482913. It expires in 15 minutes.",
}), 1500);
// Async here (not spawnSync) so the delayed delivery above can fire while `wait` blocks.
const waited = await new Promise((resolve) =>
  execFile(process.execPath, [join(root, "cli", "bin", "mailmint.mjs"), "wait", addr, "--code"],
    { env: { ...process.env, HOME: home, MAILMINT_URL: BASE, MAILMINT_KEY: KEY } },
    (_e, out, err) => resolve((out + err).trimEnd())));
const ls = cli("ls", addr);
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const lines = [
  ["$ npx mailmint new --label \"readme demo\"", addr],
  ["# … the agent types the address into the sign-up form …", null],
  [`$ npx mailmint wait ${addr} --code`, waited],
  [`$ npx mailmint ls ${addr}`, ls],
];
const term = `<!doctype html><meta charset=utf-8><style>
body{margin:0;background:#0b0b10;display:flex;padding:28px}
.win{background:#16161d;border-radius:10px;box-shadow:0 10px 40px #0008;width:100%;font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#e4e4e7}
.bar{padding:10px 14px;display:flex;gap:7px}.bar i{width:12px;height:12px;border-radius:50%;display:block}
pre{margin:0;padding:6px 20px 20px;white-space:pre-wrap}.p{color:#a5b4fc}.c{color:#71717a}.o{color:#e4e4e7}</style>
<div class=win><div class=bar><i style=background:#ff5f57></i><i style=background:#febc2e></i><i style=background:#28c840></i></div><pre>${lines
  .map(([cmd, out]) => `<span class=${cmd.startsWith("#") ? "c" : "p"}>${esc(cmd)}</span>${out ? `\n<span class=o>${esc(out)}</span>` : ""}`)
  .join("\n")}</pre></div>`;
await page.setViewportSize({ width: 1240, height: 400 });
await page.setContent(term);
const box = await page.locator(".win").boundingBox();
await page.screenshot({ path: join(outDir, "cli.png"), clip: { x: 0, y: 0, width: 1240, height: Math.ceil(box.y + box.height + 28) } });
console.log("docs/images/cli.png  ← real CLI output");
await browser.close();
