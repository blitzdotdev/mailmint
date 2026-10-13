export const name = "admin pages: list, inbox view, create, new link, extend, delete";

export default async function (t) {
  const { assert } = t;
  const post = (path, body = "") =>
    t.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: t.url, "sec-fetch-site": "same-origin" },
      body,
    });
  await t.sendEmail({ to: `admin-seed-${Date.now()}@aisocket.dev`, subject: "seed", text: "hello" });
  const home = await t.fetch("/admin", { headers: { accept: "text/html" } });
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("referrer-policy"), "same-origin", "real Origin on our own form posts");
  // What Chrome actually sends for a same-origin form post under a no-referrer policy.
  const nullOrigin = await t.fetch("/admin/inboxes", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "null", "sec-fetch-site": "same-origin" },
    body: "label=null-origin",
  });
  assert.equal(nullOrigin.status, 200, "Origin: null + Sec-Fetch-Site: same-origin is a same-origin post");
  const forged = await t.fetch("/admin/inboxes", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "null", "sec-fetch-site": "cross-site" },
    body: "label=x",
  });
  assert.equal(forged.status, 403);
  assert.match(home.headers.get("content-security-policy"), /default-src 'none'/);
  assert.match(await home.text(), /Latest mail/);

  const created = await post("/admin/inboxes", `local=admin-${Date.now()}&domain=aisocket.dev&label=from+ui&ttl_hours=24`);
  assert.equal(created.status, 200);
  const html = await created.text();
  const url = /http:\/\/127\.0\.0\.1:\d+\/i\/mm_in_[A-Za-z0-9_-]{32}/.exec(html)?.[0];
  assert.ok(url, "share link shown");
  const address = /admin-\d+@aisocket\.dev/.exec(html)[0];

  await t.sendEmail({ to: address, subject: "ui test", text: "Your code is 121212" });
  const view = await (await t.fetch(`/admin/inbox/${encodeURIComponent(address)}`, { headers: { accept: "text/html" } })).text();
  assert.ok(view.includes("121212"));

  const relink = await post(`/admin/inbox/${encodeURIComponent(address)}/link`);
  const newUrl = /http:\/\/127\.0\.0\.1:\d+\/i\/mm_in_[A-Za-z0-9_-]{32}/.exec(await relink.text())?.[0];
  assert.ok(newUrl && newUrl !== url);
  assert.equal((await t.fetch(`${url}/messages`)).status, 401, "old link revoked");
  assert.equal((await t.fetch(`${newUrl}/messages`)).status, 200);

  const ext = await post(`/admin/inbox/${encodeURIComponent(address)}/extend`, "ttl_hours=168");
  assert.equal(ext.status, 303);
  const info = (await t.api("GET", `/v1/inboxes/${address}`)).json;
  assert.ok(Date.parse(info.expires_at) - Date.now() > 160 * 3600_000);

  const del = await post(`/admin/inbox/${encodeURIComponent(address)}/delete`);
  assert.equal(del.status, 303);
  assert.equal((await t.api("GET", `/v1/inboxes/${address}`)).status, 404);

  assert.equal((await t.fetch("/admin/connect", { headers: { accept: "text/html" } })).status, 200);
}
