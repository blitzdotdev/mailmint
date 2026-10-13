export const name = "auth and input errors";

export default async function (t) {
  const { assert } = t;
  let r = await t.api("GET", "/v1/inboxes", { key: null });
  assert.equal(r.status, 401);
  assert.equal(r.json.error.code, "unauthorized");
  r = await t.api("GET", "/v1/inboxes", { key: "mm_key_" + "x".repeat(32) });
  assert.equal(r.status, 401);
  r = await t.api("GET", "/v1/inboxes", { key: "garbage" });
  assert.equal(r.status, 401);
  r = await t.fetch("/i/mm_in_" + "y".repeat(32) + "/messages");
  assert.equal(r.status, 401);

  r = await t.api("POST", "/v1/inboxes", { body: { locale: "x" } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, "unknown_field");
  assert.match(r.json.error.message, /locale/);
  r = await t.api("POST", "/v1/inboxes", { body: "not json" });
  assert.equal(r.status, 400);
  r = await t.api("POST", "/v1/inboxes", { body: { local: "Bad Name!" } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, "invalid_address");
  r = await t.api("POST", "/v1/inboxes", { body: { local: "x", domain: "gmail.com" } });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, "domain_not_allowed");
  r = await t.api("POST", "/v1/inboxes", { body: { ttl_hours: -1 } });
  assert.equal(r.status, 400);
  r = await t.api("POST", "/v1/inboxes", { body: { ttl_hours: 100000 } });
  assert.equal(r.status, 201);
  const days = (Date.parse(r.json.expires_at) - Date.now()) / 86400_000;
  assert.ok(days <= 30.01, "ttl clamped to MAX_TTL_HOURS");

  // Revoked key stops working.
  const page = await t.fetch("/admin/keys", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: t.url, "sec-fetch-site": "same-origin" },
    body: "name=temp",
  });
  const temp = /mm_key_[A-Za-z0-9_-]{32}/.exec(await page.text())[0];
  assert.equal((await t.api("GET", "/v1/me", { key: temp })).status, 200);
  const keysHtml = await (await t.fetch("/admin/keys", { headers: { accept: "text/html" } })).text();
  const id = /action="\/admin\/keys\/(\d+)\/revoke" data-confirm="Revoke temp\?"/.exec(keysHtml)?.[1];
  assert.ok(id, "revoke form for temp key");
  const rev = await t.fetch(`/admin/keys/${id}/revoke`, {
    method: "POST",
    headers: { origin: t.url, "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" },
    body: "",
  });
  assert.equal(rev.status, 303);
  assert.equal((await t.api("GET", "/v1/me", { key: temp })).status, 401);
}
