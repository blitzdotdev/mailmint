import assert from "node:assert/strict";
import { test } from "node:test";
import { isValidLocal, parseAddress, randomLocal } from "../src/lib/address.ts";
import { looksLikeToken, newApiKey, newInboxToken, sha256Hex } from "../src/lib/tokens.ts";
import { matches } from "../src/api/wait.ts";
import { verifyAccessRequest } from "../src/api/access.ts";

test("parseAddress lowercases, splits +tag, rejects junk", () => {
  assert.deepEqual(parseAddress(" Quiet-Otter+GitHub@AiSocket.dev "), {
    address: "quiet-otter@aisocket.dev",
    local: "quiet-otter",
    domain: "aisocket.dev",
    tag: "github",
  });
  assert.equal(parseAddress("a@b.c")?.tag, null);
  assert.equal(parseAddress("x+@aisocket.dev")?.tag, null);
  assert.equal(parseAddress("no-at-sign"), null);
  assert.equal(parseAddress("@aisocket.dev"), null);
  assert.equal(parseAddress('"quoted local"@aisocket.dev'), null);
  assert.equal(parseAddress("-leading@aisocket.dev"), null);
  assert.equal(parseAddress("a..b@aisocket.dev"), null);
});

test("isValidLocal", () => {
  for (const ok of ["a", "ab", "a.b", "a_b-c", "x".repeat(64)]) assert.ok(isValidLocal(ok), ok);
  for (const bad of ["", ".a", "a.", "A", "a b", "x".repeat(65), "a+b", "a@b"]) assert.ok(!isValidLocal(bad), bad);
});

test("randomLocal is valid and varied", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const l = randomLocal();
    assert.match(l, /^[a-z]+-[a-z]+-[0-9a-z]{4}$/);
    assert.ok(isValidLocal(l));
    seen.add(l);
  }
  assert.ok(seen.size > 190);
});

test("tokens have the documented shape and hash deterministically", async () => {
  const inbox = newInboxToken();
  const key = newApiKey();
  assert.match(inbox, /^bm_in_[A-Za-z0-9_-]{32}$/);
  assert.match(key, /^bm_key_[A-Za-z0-9_-]{32}$/);
  assert.ok(looksLikeToken(inbox) && looksLikeToken(key));
  assert.ok(!looksLikeToken("bm_in_short") && !looksLikeToken("Bearer x"));
  assert.notEqual(newInboxToken(), inbox);
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

const row = (over = {}) => ({
  id: 1, inbox_id: 1, rfc_message_id: "<x>", envelope_from: "bounce@mail.example", envelope_to: "a@b",
  tag: null, from_address: "noreply@github.com", from_name: "GitHub", subject: "Your code",
  text_body: null, html_body: null, html_truncated: 0, codes_json: "[]", links_json: "[]",
  best_code: null, best_link: null, attachments_json: "[]", raw_key: "k", size: 1, received_at: "",
  ...over,
});

test("wait filter", () => {
  assert.ok(matches(row(), {}));
  assert.ok(matches(row(), { from: "GITHUB" }));
  assert.ok(matches(row(), { from: "bounce@" }), "envelope sender counts");
  assert.ok(!matches(row(), { from: "gitlab" }));
  assert.ok(matches(row(), { subject: "code" }));
  assert.ok(!matches(row(), { subject: "link" }));
  assert.ok(!matches(row(), { tag: "x" }));
  assert.ok(matches(row({ tag: "x" }), { tag: "X" }));
  assert.ok(!matches(row(), { extract: "code" }));
  assert.ok(matches(row({ best_code: "123456" }), { extract: "code" }));
  assert.ok(!matches(row({ best_code: "123456" }), { extract: "link" }));
});

test("Access dev bypass only for localhost hosts", async () => {
  const env = { DEV_BYPASS_ACCESS: "1" };
  for (const host of ["http://localhost:8787/admin", "http://127.0.0.1:1/admin", "http://8787.burnermail.aibox.localhost/admin"]) {
    const r = await verifyAccessRequest(new Request(host), env);
    assert.equal(r.ok, true, host);
  }
  for (const host of ["https://mail.aisocket.dev/admin", "https://localhost.evil.example/admin", "https://evil.example/admin"]) {
    const r = await verifyAccessRequest(new Request(host), env);
    assert.equal(r.ok, false, host);
  }
  const off = await verifyAccessRequest(new Request("http://localhost/admin"), {});
  assert.equal(off.ok, false, "no bypass without the var");
  const cfg = await verifyAccessRequest(new Request("https://mail.aisocket.dev/admin"), {
    WEB_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
    WEB_ACCESS_AUD: "a".repeat(64),
  });
  assert.equal(cfg.ok, false);
  assert.equal(cfg.code, "access_missing");
});
