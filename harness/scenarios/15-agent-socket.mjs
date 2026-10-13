// `mailmint connect` through the real agent-socket relay (agentsocket.dev): the chat side calls
// HTTPS tools on the relay, the relay forwards them over WebSocket to the local CLI process, which
// calls this local mailmint. Also covers /admin/api, which the dashboard's own tools use.
// Set HARNESS_SKIP_RELAY=1 to skip the relay part when offline.
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const name = "agent-socket: `mailmint connect` link drives create/wait/read; /admin/api";

const cli = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "cli", "bin", "mailmint.mjs");

export default async function (t) {
  const { assert } = t;

  // /admin/api: the owner API behind Access (dev bypass here) + same-origin.
  const sameOrigin = { origin: t.url, "sec-fetch-site": "same-origin" };
  let r = await t.api("POST", "/admin/api/inboxes", { key: null, body: { label: "dash" }, headers: sameOrigin });
  assert.equal(r.status, 201, r.text);
  assert.ok(r.json.address);
  const dashInbox = r.json.address;
  r = await t.api("POST", "/admin/api/inboxes", { key: null, body: {}, headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
  assert.equal(r.status, 403, "cross-site write refused");
  await t.sendEmail({ to: dashInbox, subject: "dash", text: "Your code is 515151" });
  r = await t.api("GET", `/admin/api/inboxes/${dashInbox}/wait?extract=code&timeout=2`, { key: null });
  assert.equal(r.json.message.code, "515151");
  assert.ok(r.json.message.url.startsWith("/admin/api/messages/"));

  if (process.env.HARNESS_SKIP_RELAY === "1") return;

  // CLI login for the connect process (separate config file).
  const env = { ...process.env, MAILMINT_CONFIG: join(t.state.dir, "connect-config.json") };
  const login = spawn(process.execPath, [cli, "login", "--url", t.url, "--key", t.state.key], { env });
  await new Promise((res) => login.on("close", res));

  const child = spawn(process.execPath, [cli, "connect", "--json"], { env });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (d) => (stdout += d));
  child.stderr.on("data", (d) => (stderr += d));
  try {
    const started = Date.now();
    while (!stdout.includes("}") && Date.now() - started < 20_000) await t.sleep(200);
    const { url } = JSON.parse(stdout);
    assert.match(url, /^https:\/\/agentsocket\.dev\/v1\/t\/as_[A-Za-z0-9]+_[A-Za-z0-9_-]+\/agents\.md$/);
    const base = url.replace(/\/agents\.md$/, "");

    const md = await (await fetch(url)).text();
    assert.match(md, /mailmint: disposable inboxes/);
    const tools = await (await fetch(`${base}/tools.json`)).json();
    const paths = (tools.tools ?? tools).map((x) => x.path).sort();
    assert.deepEqual(paths, ["/create_inbox", "/delete_inbox", "/list_inboxes", "/list_messages", "/read_message", "/wait_for_email"]);

    const call = async (path, body) => {
      const res = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return { status: res.status, json: await res.json() };
    };
    const created = await call("/create_inbox", { label: "via agent-socket" });
    assert.equal(created.status, 200, JSON.stringify(created.json));
    const address = created.json.address;
    assert.match(address, /@aisocket\.dev$/);

    const waiting = call("/wait_for_email", { address, extract: "code", timeout_seconds: 20 });
    await t.sleep(1000);
    await t.sendEmail({ to: address, subject: "Your Acme code", text: "Your Acme verification code is 626262." });
    const waited = await waiting;
    assert.equal(waited.json.message.code, "626262");

    const read = await call("/read_message", { id: waited.json.message.id });
    assert.match(read.json.text, /626262/);
    const listed = await call("/list_messages", { address });
    assert.equal(listed.json.messages.length, 1);
    const bad = await call("/wait_for_email", {});
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error.code, "invalid_request");
    const del = await call("/delete_inbox", { address });
    assert.equal(del.json.deleted, address);
    assert.match(stderr, /\/wait_for_email/, "CLI logs tool calls");
  } finally {
    child.kill("SIGINT");
    await new Promise((res) => child.on("close", res));
  }
}
