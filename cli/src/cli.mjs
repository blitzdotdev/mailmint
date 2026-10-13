#!/usr/bin/env node
// mailmint CLI: disposable inboxes for sign-up testing. Zero dependencies (Node >= 22).
//
//   mailmint login --url https://mail.example.com --key mm_key_…
//   addr=$(mailmint new)                      # prints the address
//   code=$(mailmint wait "$addr" --code)      # blocks until the code arrives, prints it
//
// An inbox share link (https://host/i/mm_in_…) works anywhere an address does, with no key.
// Config: ~/.mailmint/config.json, or MAILMINT_URL / MAILMINT_KEY (env wins).

import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const HELP = `mailmint: disposable inboxes for sign-up testing

Usage:
  mailmint login [--url URL] [--key KEY]   Save the instance URL and an API key (from /admin/keys)
  mailmint whoami                           Show who the key belongs to
  mailmint new [name] [options]             Create an inbox; prints its address
      --ttl 7d|24h|90m    lifetime (plain number = hours; default 7d)
      --label TEXT        note to self
      --domain DOMAIN     mail domain (default: the instance's first)
  mailmint wait <inbox> [options]           Wait for a message; prints it (or just the code/link)
      --code              only match mail with a verification code; print the code
      --link              only match mail with a verification link; print the link
      --from TEXT         sender address/name contains TEXT
      --subject TEXT      subject contains TEXT
      --tag TAG           mail sent to name+TAG@domain
      --since ID|latest   only messages with id > ID (default 0: any); latest = only new mail
      --timeout 2m        give up after this long (plain number = seconds; default 2m), exit code 2
  mailmint ls [inbox]                       List inboxes, or the messages in one
  mailmint read <id> [--text|--html|--raw]  Show a message (default: summary + text)
  mailmint rm <inbox>                       Delete an inbox and its mail
  mailmint connect [--relay URL]            Link any AI chat to mailmint via agent-socket: prints an
                                            agentsocket.dev/…/agents.md link with create/wait/read tools
                                            (owner access via your API key). Works while this runs.

<inbox> is an address, its name part, or a share link (https://host/i/mm_in_…).
Global: --json (machine-readable output), --url, --key.
Exit codes: 0 ok, 1 error, 2 timed out.
`;

// ---------- proxy support (agent sandboxes) ----------
// Node's fetch only honours HTTPS_PROXY with NODE_USE_ENV_PROXY=1 (Node >= 22.21 / 24.5);
// re-exec once with it set.
if ((process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy) &&
    !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  process.exit(r.status ?? 1);
}

// ---------- args ----------

const BOOL = new Set(["json", "code", "link", "text", "html", "raw", "help"]);
const VALUED = new Set(["url", "key", "ttl", "label", "domain", "from", "subject", "tag", "since", "timeout", "relay"]);

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h") { flags.help = true; continue; }
    if (!a.startsWith("--")) { positional.push(a); continue; }
    const eq = a.indexOf("=");
    const name = a.slice(2, eq === -1 ? undefined : eq);
    if (BOOL.has(name)) { flags[name] = true; continue; }
    if (!VALUED.has(name)) fail(`unknown option --${name}. See mailmint --help`);
    const value = eq === -1 ? argv[++i] : a.slice(eq + 1);
    if (value === undefined) fail(`--${name} needs a value`);
    flags[name] = value;
  }
  return { positional, flags };
}

function fail(message, code = 1) {
  process.stderr.write(`mailmint: ${message}\n`);
  process.exit(code);
}

/** "90s" "5m" "2h" "7d" → seconds. Plain numbers use `plainUnit` seconds. */
function durationSeconds(value, plainUnit) {
  const m = /^(\d+(?:\.\d+)?)\s*([smhd]?)$/i.exec(String(value).trim());
  if (!m) fail(`bad duration "${value}" (use e.g. 90s, 5m, 2h, 7d)`);
  const n = Number(m[1]);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2].toLowerCase()] ?? plainUnit;
  return n * unit;
}

// ---------- config ----------

const CONFIG_PATH = process.env.MAILMINT_CONFIG || join(homedir(), ".mailmint", "config.json");

function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function settings(flags) {
  const file = readConfig();
  const url = (flags.url || process.env.MAILMINT_URL || file.url || "").replace(/\/+$/, "");
  const key = flags.key || process.env.MAILMINT_KEY || file.key || "";
  return { url, key };
}

// ---------- http ----------

async function request(method, url, { key, body, accept = "application/json" } = {}) {
  const headers = { accept, "user-agent": "mailmint-cli/0.1" };
  if (key) headers.authorization = `Bearer ${key}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (error) {
    fail(`request to ${new URL(url).origin} failed: ${error.cause?.code ?? error.message}`);
  }
  if (accept !== "application/json") {
    if (!res.ok) fail(`${res.status} ${await res.text()}`);
    return res;
  }
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    fail(`${res.status}: unexpected response from server`);
  }
  if (!res.ok) fail(json?.error?.message ? `${json.error.message} (${json.error.code})` : `HTTP ${res.status}`);
  return json;
}

/**
 * Resolve <inbox> to API endpoints. A share link carries its own credential;
 * anything else goes through /v1 with the API key.
 */
function target(inbox, s) {
  const share = /^(https?:\/\/[^/]+)\/i\/(mm_in_[A-Za-z0-9_-]+)\/?/.exec(inbox ?? "");
  if (share) {
    const base = `${share[1]}/i/${share[2]}`;
    return { key: "", wait: `${base}/wait`, messages: `${base}/messages`, inbox: `${base}/inbox`, del: base, message: (id) => `${base}/messages/${id}` };
  }
  if (!s.url) fail("no instance configured: run `mailmint login --url … --key …` (or set MAILMINT_URL/MAILMINT_KEY)");
  if (!s.key) fail("no API key: run `mailmint login --key …` (or set MAILMINT_KEY)");
  const enc = encodeURIComponent(inbox);
  const base = `${s.url}/v1/inboxes/${enc}`;
  return { key: s.key, wait: `${base}/wait`, messages: `${base}/messages`, inbox: base, del: base, message: (id) => `${s.url}/v1/messages/${id}` };
}

function out(value, flags, plain) {
  if (flags.json) process.stdout.write(JSON.stringify(value, null, 2) + "\n");
  else process.stdout.write(plain + "\n");
}

function line(m) {
  const extra = m.code ? `  code=${m.code}` : m.link ? `  link=${m.link}` : "";
  return `${m.id}\t${m.received_at}\t${m.from}\t${m.subject}${extra}`;
}

// ---------- commands ----------

async function login(flags) {
  const current = readConfig();
  const url = (flags.url || current.url || "").replace(/\/+$/, "");
  const key = flags.key || current.key || "";
  if (!url) fail("--url is required the first time");
  if (!key) fail(`--key is required the first time (create one at ${url}/admin/keys)`);
  const me = await request("GET", `${url}/v1/me`, { key });
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_PATH, JSON.stringify({ url, key }, null, 2) + "\n", { mode: 0o600 });
  chmodSync(CONFIG_PATH, 0o600);
  out({ url, ...me, config: CONFIG_PATH }, flags, `Logged in to ${url} (${me.kind}${me.key ? `: ${me.key}` : ""}). Saved ${CONFIG_PATH}`);
}

async function whoami(flags) {
  const s = settings(flags);
  if (!s.url || !s.key) fail("not logged in");
  const me = await request("GET", `${s.url}/v1/me`, { key: s.key });
  out({ url: s.url, ...me }, flags, `${s.url}  ${me.kind}${me.key ? `: ${me.key}` : `: ${me.inbox}`}`);
}

async function create(positional, flags) {
  const s = settings(flags);
  if (!s.url || !s.key) fail("not logged in: run `mailmint login --url … --key …`");
  const body = {};
  if (positional[0]) body.local = positional[0];
  if (flags.domain) body.domain = flags.domain;
  if (flags.label) body.label = flags.label;
  if (flags.ttl) body.ttl_hours = durationSeconds(flags.ttl, 3600) / 3600;
  const inbox = await request("POST", `${s.url}/v1/inboxes`, { key: s.key, body });
  out(inbox, flags, inbox.address);
  if (!flags.json && process.stderr.isTTY) process.stderr.write(`share link: ${inbox.url}\nexpires: ${inbox.expires_at}\n`);
}

async function wait(positional, flags) {
  const inbox = positional[0];
  if (!inbox) fail("usage: mailmint wait <inbox> [--code|--link]");
  if (flags.code && flags.link) fail("use --code or --link, not both");
  const t = target(inbox, settings(flags));
  const deadline = Date.now() + durationSeconds(flags.timeout ?? "2m", 1) * 1000;
  let since = flags.since ?? "0";
  for (;;) {
    const remaining = Math.ceil((deadline - Date.now()) / 1000);
    // Server long-polls; keep each request under ~60s so proxies don't cut it.
    const q = new URLSearchParams({ since: String(since), timeout: String(Math.max(0, Math.min(remaining, 55))) });
    if (flags.code) q.set("extract", "code");
    if (flags.link) q.set("extract", "link");
    for (const k of ["from", "subject", "tag"]) if (flags[k]) q.set(k, flags[k]);
    const r = await request("GET", `${t.wait}?${q}`, { key: t.key });
    if (r.message) {
      const m = r.message;
      if (flags.json) out(m, flags, "");
      else if (flags.code) out(m, flags, m.code);
      else if (flags.link) out(m, flags, m.link);
      else out(m, flags, `${line(m)}\n\n${m.text ?? ""}`);
      return;
    }
    since = r.cursor;
    if (Date.now() >= deadline) {
      if (flags.json) out({ message: null, timed_out: true, cursor: r.cursor }, flags, "");
      fail(`timed out waiting for mail in ${r.inbox ?? inbox}`, 2);
    }
  }
}

async function list(positional, flags) {
  const s = settings(flags);
  if (!positional[0]) {
    if (!s.url || !s.key) fail("not logged in");
    const r = await request("GET", `${s.url}/v1/inboxes`, { key: s.key });
    out(r, flags, r.inboxes.map((i) => `${i.address}\t${i.message_count} msgs\texpires ${i.expires_at}${i.label ? `\t${i.label}` : ""}`).join("\n") || "(no inboxes)");
    return;
  }
  const t = target(positional[0], s);
  const r = await request("GET", `${t.messages}?limit=50`, { key: t.key });
  out(r, flags, r.messages.map(line).join("\n") || "(no messages)");
}

async function read(positional, flags) {
  const id = positional[0];
  if (!id) fail("usage: mailmint read <id> [--text|--html|--raw]  (or: read <share link> <id>)");
  // `read <share link> <id>` reads through the link.
  const viaLink = /^https?:\/\//.test(id);
  const t = target(viaLink ? id : "_", settings(flags));
  const msgId = viaLink ? positional[1] : id;
  if (!/^\d+$/.test(msgId ?? "")) fail("message id must be a number");
  const url = t.message(msgId);
  if (flags.raw || flags.html) {
    const res = await request("GET", `${url}/${flags.raw ? "raw" : "html"}`, { key: t.key, accept: "*/*" });
    process.stdout.write(Buffer.from(await res.arrayBuffer()));
    return;
  }
  const m = await request("GET", url, { key: t.key });
  if (flags.text) out(m, flags, m.text ?? "");
  else {
    const head = [`From: ${m.from_name ? `${m.from_name} <${m.from}>` : m.from}`, `To: ${m.to}`, `Subject: ${m.subject}`, `Date: ${m.received_at}`];
    if (m.code) head.push(`Code: ${m.code}`);
    if (m.link) head.push(`Link: ${m.link}`);
    out(m, flags, `${head.join("\n")}\n\n${m.text ?? "(no text part; use --html)"}`);
  }
}

async function remove(positional, flags) {
  if (!positional[0]) fail("usage: mailmint rm <inbox>");
  const t = target(positional[0], settings(flags));
  const r = await request("DELETE", t.del, { key: t.key });
  out(r, flags, `deleted ${r.deleted}`);
}

async function connectCmd(flags) {
  const s = settings(flags);
  if (!s.url || !s.key) fail("not logged in: run `mailmint login --url … --key …`");
  const { connect } = await import("@agent-socket/sdk");
  const { APP_ID, agentsMd, buildTools, fetchApi } = await import("./socket-tools.mjs");
  const api = fetchApi(`${s.url}/v1`, { authorization: `Bearer ${s.key}`, "user-agent": "mailmint-cli/0.1 (agent-socket)" });
  const log = (line) => process.stderr.write(`${new Date().toISOString().slice(11, 19)} ${line}\n`);
  const tools = buildTools(api).map((tool) => ({
    ...tool,
    handler: async (ctx) => {
      const result = await tool.handler(ctx);
      log(`${tool.path}${result?.status >= 400 ? ` → ${result.status}` : ""}`);
      return result;
    },
  }));
  const relay = (flags.relay || process.env.MAILMINT_RELAY || "https://agentsocket.dev").replace(/\/+$/, "");
  let session;
  try {
    session = await connect({
      baseUrl: relay,
      appId: APP_ID,
      appDescription: "Disposable inboxes: create an address, wait for the verification code or link.",
      agentsMd: agentsMd(s.url),
      tools,
      onSessionChanged: ({ tokensRemapped }) => {
        for (const [, url] of Object.entries(tokensRemapped ?? {})) log(`relay session was replaced; new link: ${url}`);
      },
    });
  } catch (error) {
    fail(`could not reach the agent-socket relay at ${relay}: ${error.message}`);
  }
  const link = await session.mintAgentToken({ label: "mailmint-cli" });
  out({ url: link.url, session: session.sessionId }, flags, link.url);
  if (!flags.json) {
    process.stderr.write("Paste the link above into an AI chat. It works while this keeps running; Ctrl-C ends it.\n");
  }
  const stop = async () => {
    try {
      await session.close();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await new Promise(() => {});
}

// ---------- main ----------

const { positional, flags } = parseArgs(process.argv.slice(2));
const [command, ...rest] = positional;

if (flags.help || !command || command === "help") {
  process.stdout.write(HELP);
  process.exit(command || flags.help ? 0 : 1);
}

const commands = {
  login: () => login(flags),
  whoami: () => whoami(flags),
  new: () => create(rest, flags),
  wait: () => wait(rest, flags),
  ls: () => list(rest, flags),
  read: () => read(rest, flags),
  rm: () => remove(rest, flags),
  connect: () => connectCmd(flags),
};
const run = commands[command];
if (!run) fail(`unknown command "${command}". See mailmint --help`);
await run();
