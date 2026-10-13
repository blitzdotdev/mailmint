import { createHash, randomBytes } from "node:crypto";

export const name = "MCP: OAuth (register, PKCE, consent, token) then tools";

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function rpc(t, token, method, params, id) {
  const res = await t.fetch("/mcp", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const text = await res.text();
  if (res.status !== 200) throw new Error(`${method}: HTTP ${res.status} ${text}`);
  // Either plain JSON or an SSE stream with `data:` lines.
  const payload = res.headers.get("content-type")?.includes("text/event-stream")
    ? text.split("\n").filter((l) => l.startsWith("data:")).map((l) => JSON.parse(l.slice(5))).find((m) => m.id === id)
    : JSON.parse(text);
  if (payload.error) throw new Error(`${method}: ${JSON.stringify(payload.error)}`);
  return payload.result;
}

export default async function (t) {
  const { assert } = t;

  // Unauthenticated MCP gets a 401 pointing at the resource metadata.
  const anon = await t.fetch("/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(anon.status, 401);
  assert.match(anon.headers.get("www-authenticate"), /resource_metadata=/);

  const meta = await (await t.fetch("/.well-known/oauth-authorization-server")).json();
  assert.ok(meta.authorization_endpoint && meta.token_endpoint && meta.registration_endpoint);

  const redirectUri = "http://127.0.0.1:9/callback";
  const reg = await t.fetch(meta.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "harness",
      redirect_uris: [redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    }),
  });
  assert.equal(reg.status, 201, await reg.clone().text());
  const { client_id } = await reg.json();

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const q = new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri: redirectUri,
    scope: "inbox.read inbox.manage",
    state: "s123",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: `${t.url}/mcp`,
  });
  const consent = await t.fetch(`/authorize?${q}`, { headers: { accept: "text/html" } });
  assert.equal(consent.status, 200);
  const consentHtml = await consent.text();
  assert.match(consentHtml, /Manage inboxes/);
  const txn = /name="authorization_transaction" value="([0-9a-f]{64})"/.exec(consentHtml)?.[1];
  assert.ok(txn);

  const approve = await t.fetch(`/authorize?${q}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: t.url,
      referer: `${t.url}/authorize`,
      "sec-fetch-site": "same-origin",
    },
    body: new URLSearchParams({ authorization_transaction: txn, decision: "approve" }).toString(),
  });
  assert.equal(approve.status, 303, await approve.clone().text());
  const location = new URL(approve.headers.get("location"));
  assert.equal(location.searchParams.get("state"), "s123");
  const code = location.searchParams.get("code");
  assert.ok(code);

  const tokenRes = await t.fetch(meta.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id,
      code_verifier: verifier,
      resource: `${t.url}/mcp`,
    }).toString(),
  });
  assert.equal(tokenRes.status, 200, await tokenRes.clone().text());
  const { access_token } = await tokenRes.json();

  const init = await rpc(t, access_token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "harness", version: "0" },
  }, 1);
  assert.equal(init.serverInfo.name, "mailmint");

  const tools = await rpc(t, access_token, "tools/list", {}, 2);
  assert.deepEqual(
    tools.tools.map((x) => x.name).sort(),
    ["create_inbox", "delete_inbox", "list_inboxes", "list_messages", "read_message", "wait_for_email"],
  );

  const created = await rpc(t, access_token, "tools/call", { name: "create_inbox", arguments: { label: "mcp" } }, 3);
  const inbox = created.structuredContent;
  assert.match(inbox.address, /@aisocket\.dev$/);

  const waiting = rpc(t, access_token, "tools/call", {
    name: "wait_for_email",
    arguments: { address: inbox.address, extract: "code", timeout_seconds: 20 },
  }, 4);
  await t.sleep(1000);
  await t.sendEmail({ to: inbox.address, subject: "Sign in to Example", text: "Your login code is 731905." });
  const waited = (await waiting).structuredContent;
  assert.equal(waited.message.code, "731905");

  const read = await rpc(t, access_token, "tools/call", { name: "read_message", arguments: { id: waited.message.id } }, 5);
  assert.match(read.structuredContent.text, /731905/);

  const err = await rpc(t, access_token, "tools/call", { name: "read_message", arguments: { id: 99999999 } }, 6);
  assert.equal(err.isError, true);

  const del = await rpc(t, access_token, "tools/call", { name: "delete_inbox", arguments: { address: inbox.address } }, 7);
  assert.equal(del.structuredContent.deleted, inbox.address);
}
