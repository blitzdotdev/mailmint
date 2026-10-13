#!/usr/bin/env node
// Real-world sign-up tests: drive real services' sign-up / login-code forms in headless
// Chromium with a fresh mailmint address, then wait for the real email and check what the
// extractor pulled out. Screenshots + raw .eml land in .trash/signup/ (raw mail is a
// candidate for worker/tests/fixtures/extract/ after scrubbing).
//
//   node scripts/signup-e2e.mjs                 # all services
//   node scripts/signup-e2e.mjs notion slack    # some
// Env (from .env): MAILMINT_URL, MAILMINT_KEY. CHROMIUM=/path overrides /usr/bin/chromium.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(root, ".env"), "utf8").split("\n")) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { MAILMINT_URL: BASE, MAILMINT_KEY: KEY } = process.env;
const out = join(root, ".trash", "signup");
mkdirSync(out, { recursive: true });

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { authorization: `Bearer ${KEY}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const EMAIL = 'input[type=email], input[name*="email" i], input[autocomplete="email"], input[autocomplete="username"], input[placeholder*="mail" i], input[id*="email" i]';

async function fillEmail(page, email) {
  const input = page.locator(EMAIL).filter({ visible: true }).first();
  await input.waitFor({ state: "visible", timeout: 25_000 });
  await input.click();
  await input.fill(email);
}

async function clickButton(page, name) {
  const button = page.getByRole("button", { name }).filter({ visible: true }).first();
  await button.waitFor({ state: "visible", timeout: 15_000 });
  await button.click();
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Each service: open, enter the address, trigger the email. `expect`: what the mail should carry. */
const SERVICES = {
  notion: { expect: "code", async run(page, email) {
    await page.goto("https://www.notion.so/signup");
    await fillEmail(page, email);
    await clickButton(page, /^continue$/i);
  } },
  slack: { expect: "code", async run(page, email) {
    await page.goto("https://slack.com/get-started#/createnew");
    await fillEmail(page, email);
    await clickButton(page, /^continue$/i);
  } },
  linear: { expect: "code", async run(page, email) {
    await page.goto("https://linear.app/signup");
    await clickButton(page, /continue with email/i);
    await fillEmail(page, email);
    await clickButton(page, /continue with email/i);
  } },
  substack: { expect: "link", async run(page, email) {
    await page.goto("https://substack.com/sign-in");
    await fillEmail(page, email);
    await clickButton(page, /continue|sign in/i);
  } },
  figma: { expect: "link", async run(page, email) {
    await page.goto("https://www.figma.com/signup");
    await fillEmail(page, email);
    await clickButton(page, /^continue with email$/i);
    await pause(2500);
    const pw = page.locator("input[type=password]").filter({ visible: true }).first();
    if (await pw.count()) {
      await pw.fill(`Mm-${Math.random().toString(36).slice(2)}-Aa9!`);
      await clickButton(page, /create account|continue|sign up/i);
    }
  } },
  cursor: { expect: "code", async run(page, email) {
    await page.goto("https://authenticator.cursor.sh/");
    await fillEmail(page, email);
    await clickButton(page, /^continue with email$/i);
    await pause(3000);
    await clickButton(page, /email sign-in code|sign in with email code|send code/i).catch(() => {});
  } },
  github: { expect: "code", async run(page, email) {
    await page.goto("https://github.com/signup");
    await fillEmail(page, email);
    await clickButton(page, /^continue$/i).catch(() => {});
  } },
  huggingface: { expect: "link", async run(page, email) {
    await page.goto("https://huggingface.co/join");
    await page.locator("input[name=email]").fill(email);
    await page.locator("input[name=password]").fill(`Mm-${Math.random().toString(36).slice(2)}-Aa9!`);
    await clickButton(page, /^next$/i);
  } },
  vercel: { expect: "code", async run(page, email) {
    await page.goto("https://vercel.com/login");
    await clickButton(page, /continue with email/i).catch(() => {});
    await fillEmail(page, email);
    await clickButton(page, /^continue with email$|^continue$/i);
  } },
  railway: { expect: "link", async run(page, email) {
    await page.goto("https://railway.com/login");
    await clickButton(page, /^email$|log in using email|continue with email/i).catch(() => {});
    await fillEmail(page, email);
    await page.keyboard.press("Enter");
  } },
  render: { expect: "link", async run(page, email) {
    await page.goto("https://dashboard.render.com/register");
    await fillEmail(page, email);
    await page.locator("input[type=password]").first().fill(`Mm-${Math.random().toString(36).slice(2)}-Aa9!`);
    await clickButton(page, /create account|sign up/i);
  } },
  resend: { expect: "link", async run(page, email) {
    await page.goto("https://resend.com/signup");
    await fillEmail(page, email);
    await page.locator("input[type=password]").first().fill(`Mm-${Math.random().toString(36).slice(2)}-Aa9!`);
    await clickButton(page, /create account|sign up/i);
  } },
  perplexity: { expect: "code", async run(page, email) {
    await page.goto("https://www.perplexity.ai/");
    await clickButton(page, /^sign up$|^log in$|^sign in$/i).catch(() => {});
    await fillEmail(page, email);
    await clickButton(page, /continue with email/i);
  } },
  claude: { expect: "code", async run(page, email) {
    await page.goto("https://claude.ai/login");
    await fillEmail(page, email);
    await clickButton(page, /continue with email/i);
  } },
  airtable: { expect: "link", async run(page, email) {
    await page.goto("https://airtable.com/signup");
    await fillEmail(page, email);
    await clickButton(page, /^continue$/i);
  } },
  framer: { expect: "code", async run(page, email) {
    await page.goto("https://www.framer.com/signup/");
    await clickButton(page, /continue with email/i).catch(() => {});
    await fillEmail(page, email);
    await clickButton(page, /^continue$|continue with email/i);
  } },
  canva: { expect: "code", async run(page, email) {
    await page.goto("https://www.canva.com/signup");
    await clickButton(page, /continue with email/i);
    await fillEmail(page, email);
    await clickButton(page, /^continue$/i);
    await pause(3000);
    await clickButton(page, /^continue$/i).catch(() => {}); // "Create your account": name is pre-filled
  } },
};

async function runOne(browser, name) {
  const svc = SERVICES[name];
  const inbox = await api("POST", "/v1/inboxes", { label: `signup-e2e ${name}`, ttl_hours: 72 });
  const email = inbox.address;
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const result = { service: name, address: email, form: "ok" };
  try {
    await svc.run(page, email);
    await pause(4000);
  } catch (error) {
    result.form = `error: ${error.message.split("\n")[0]}`;
  }
  await page.screenshot({ path: join(out, `${name}.png`) }).catch(() => {});
  result.page = (await page.title().catch(() => "")) + " | " + page.url();
  const bodyText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  if (/captcha|verify you are human|are you a robot|press and hold|unusual activity|security check/i.test(bodyText)) {
    result.blocked = "captcha/bot check on page";
  }
  // Mail may still arrive even if our post-submit step failed.
  const deadline = Date.now() + 90_000;
  let message = null;
  while (!message && Date.now() < deadline) {
    const r = await api("GET", `/v1/inboxes/${encodeURIComponent(email)}/wait?timeout=25`);
    message = r.message;
  }
  if (message) {
    result.mail = { from: message.from, subject: message.subject, code: message.code, link: message.link, codes: message.codes };
    const raw = await fetch(`${BASE}/v1/messages/${message.id}/raw`, { headers: { authorization: `Bearer ${KEY}` } });
    writeFileSync(join(out, `${name}.eml`), Buffer.from(await raw.arrayBuffer()));
    result.extracted = svc.expect === "code" ? (message.code ? "code ✓" : "NO CODE") : message.link ? "link ✓" : "NO LINK";
  } else {
    result.mail = null;
  }
  await context.close();
  return result;
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SERVICES);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
});
const results = await Promise.all(names.map((n) => runOne(browser, n).catch((e) => ({ service: n, error: e.message }))));
await browser.close();
writeFileSync(join(out, "results.json"), JSON.stringify(results, null, 2));
for (const r of results) console.log(JSON.stringify(r));
