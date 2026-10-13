// Mint the owner API key through the admin UI (Access is bypassed on localhost in dev),
// which every later scenario uses.
export const name = "admin UI creates an API key";

export default async function (t) {
  const { assert } = t;
  const page = await t.fetch("/admin/keys", { headers: { accept: "text/html" } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /API keys/);

  // Cross-site POST is refused.
  const csrf = await t.fetch("/admin/keys", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    body: "name=evil",
  });
  assert.equal(csrf.status, 403);

  const res = await t.fetch("/admin/keys", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: t.url, "sec-fetch-site": "same-origin" },
    body: "name=harness",
  });
  assert.equal(res.status, 200);
  const html = await res.text();
  const key = /bm_key_[A-Za-z0-9_-]{32}/.exec(html)?.[0];
  assert.ok(key, "key shown once on the page");
  t.state.key = key;

  const me = await t.api("GET", "/v1/me");
  assert.equal(me.status, 200);
  assert.deepEqual(me.json, { kind: "owner", key: "harness" });

  // Listing never shows the full key again.
  const again = await (await t.fetch("/admin/keys", { headers: { accept: "text/html" } })).text();
  assert.ok(!again.includes(key));
}
