#!/usr/bin/env node
// Black-box harness: starts `wrangler dev` on a free port with throwaway local
// state, then runs harness/scenarios/NN-*.mjs in order against it.
//
//   node harness/run.mjs                 # all scenarios
//   node harness/run.mjs 03 07-09        # some
//   node harness/run.mjs --continue      # don't stop at the first failure
//   node harness/run.mjs --keep          # keep the wrangler dev + state dir afterwards (prints them)
//
// Each scenario: `export const name = "…"; export default async function (t) { … }`.
// Email goes in through wrangler's local `/cdn-cgi/handler/email` endpoint.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, renameSync, mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const workerDir = join(root, "worker");
const cliBin = join(root, "cli", "bin", "mailmint.mjs");
const wrangler = join(root, "node_modules", ".bin", "wrangler");

const args = process.argv.slice(2);
const keepGoing = args.includes("--continue");
const keep = args.includes("--keep");
const selectors = args.filter((a) => !a.startsWith("--"));

function selected(file) {
  if (selectors.length === 0) return true;
  const n = Number(file.slice(0, 2));
  return selectors.some((s) => {
    const [a, b] = s.split("-").map(Number);
    return b === undefined ? n === a : n >= a && n <= b;
  });
}

function freePort() {
  return new Promise((resolve) => {
    const srv = createServer().listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// ---------- helpers given to scenarios ----------

let seq = 0;
export function buildEml({ from = "sender@example.com", to, subject = "Hello", text, html, messageId, headers = {} }) {
  const id = messageId ?? `<harness-${Date.now()}-${++seq}@example.com>`;
  const head = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `Message-ID: ${id}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
  ];
  if (html && text) {
    const b = `b${Date.now()}${seq}`;
    return [
      ...head,
      `Content-Type: multipart/alternative; boundary="${b}"`,
      "",
      `--${b}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      text,
      `--${b}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      html,
      `--${b}--`,
      "",
    ].join("\r\n");
  }
  return [...head, `Content-Type: text/${html ? "html" : "plain"}; charset=utf-8`, "", html ?? text ?? "", ""].join("\r\n");
}

function makeContext(url, state) {
  const t = {
    url,
    assert,
    state, // shared across scenarios (e.g. the API key minted in 01)
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    buildEml,
    /** Deliver an email through the local Email Routing simulator. Returns { status, text }. */
    async sendEmail({ from = "sender@example.com", to, raw, ...rest }) {
      const body = raw ?? buildEml({ from, to, ...rest });
      const q = new URLSearchParams({ from, to });
      const res = await fetch(`${url}/cdn-cgi/handler/email?${q}`, {
        method: "POST",
        headers: { "Content-Type": "message/rfc822" },
        body,
      });
      return { status: res.status, text: await res.text() };
    },
    /** JSON API call. `key` defaults to the harness owner key. */
    async api(method, path, { key = state.key, body, headers = {} } = {}) {
      const res = await fetch(`${url}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(key ? { authorization: `Bearer ${key}` } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {}
      return { status: res.status, json, text, headers: res.headers };
    },
    async fetch(path, init = {}) {
      return fetch(path.startsWith("http") ? path : `${url}${path}`, { redirect: "manual", ...init });
    },
    /** Run the CLI. Returns { code, stdout, stderr }. */
    cli(argv, env = {}) {
      return new Promise((resolve) => {
        const child = spawn(process.execPath, [cliBin, ...argv], {
          env: { ...process.env, MAILMINT_CONFIG: join(state.dir, "cli-config.json"), ...env },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d));
        child.stderr.on("data", (d) => (stderr += d));
        child.on("close", (code) => resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() }));
      });
    },
    async triggerScheduled() {
      const res = await fetch(`${url}/cdn-cgi/handler/scheduled?cron=${encodeURIComponent("17 * * * *")}`);
      return { status: res.status, text: await res.text() };
    },
  };
  return t;
}

// ---------- wrangler dev lifecycle ----------

export async function startDev({ vars = {}, label = "dev" } = {}) {
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), `mailmint-${label}-`));
  const persist = join(dir, "state");
  const migrate = spawnSync(wrangler, ["d1", "migrations", "apply", "DB", "--local", "--persist-to", persist], {
    cwd: workerDir,
    encoding: "utf8",
    env: { ...process.env, CI: "1" },
  });
  if (migrate.status !== 0) throw new Error(`migrations failed:\n${migrate.stdout}\n${migrate.stderr}`);
  const varArgs = Object.entries(vars).flatMap(([k, v]) => ["--var", `${k}:${v}`]);
  const child = spawn(
    wrangler,
    // --local-upstream: otherwise wrangler presents requests as the custom-domain host
    // (http://mail.aisocket.dev), which breaks the localhost-only Access bypass and share-link origins.
    ["dev", "--port", String(port), "--ip", "127.0.0.1", "--local-upstream", `127.0.0.1:${port}`, "--persist-to", persist, "--test-scheduled", ...varArgs],
    { cwd: workerDir, env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" }, stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const url = `http://127.0.0.1:${port}`;
  const started = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited early:\n${log}`);
    try {
      const r = await fetch(`${url}/healthz`);
      if (r.ok) break;
    } catch {}
    if (Date.now() - started > 60_000) {
      child.kill();
      throw new Error(`wrangler dev did not become ready:\n${log}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return { url, dir, child, log: () => log, stop: () => child.kill("SIGTERM") };
}

// ---------- main ----------

async function main() {
  const files = readdirSync(join(here, "scenarios"))
    .filter((f) => /^\d\d-.*\.mjs$/.test(f))
    .sort()
    .filter(selected);
  const dev = await startDev();
  console.log(`wrangler dev at ${dev.url} (state ${dev.dir})`);
  const state = { dir: dev.dir, startDev };
  const t = makeContext(dev.url, state);

  let passed = 0;
  let failed = 0;
  for (const file of files) {
    const started = Date.now();
    let mod = {};
    try {
      // Inside the try: a scenario that fails to load must not skip stopping wrangler dev below.
      mod = await import(join(here, "scenarios", file));
      await mod.default(t);
      passed++;
      console.log(`  ok   ${file} ${mod.name ?? ""} (${Date.now() - started}ms)`);
    } catch (error) {
      failed++;
      console.log(`  FAIL ${file} ${mod.name ?? ""}\n${String(error.stack ?? error).replace(/^/gm, "       ")}`);
      if (!keepGoing) break;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed, ${files.length - passed - failed} not run`);
  if (failed && !keep) console.log("--- wrangler dev log (tail) ---\n" + dev.log().split("\n").slice(-40).join("\n"));
  if (keep) {
    console.log(`kept: ${dev.url} (pid ${dev.child.pid}), state ${dev.dir}`);
  } else {
    dev.stop();
    const trash = join(root, ".trash");
    mkdirSync(trash, { recursive: true });
    try {
      renameSync(dev.dir, join(trash, `harness-${Date.now()}`));
    } catch {}
  }
  process.exitCode = failed ? 1 : 0;
  if (!keep) setTimeout(() => process.exit(process.exitCode), 500).unref();
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
