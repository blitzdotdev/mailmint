export const name = "expiry: expired API inbox rejects mail; purge deletes it";

export default async function (t) {
  const { assert } = t;
  // ~1.1 seconds of life.
  const inbox = (await t.api("POST", "/v1/inboxes", { body: { ttl_hours: 0.0003 } })).json;
  await t.sendEmail({ to: inbox.address, subject: "in time", text: "hi" });
  await t.sleep(1500);

  const late = await t.sendEmail({ to: inbox.address, subject: "too late", text: "hi" });
  assert.ok(late.status >= 400 || /expired|reject/i.test(late.text), `rejected after expiry: ${late.status} ${late.text}`);

  // Expired inbox token no longer works.
  assert.equal((await t.fetch(`/i/${inbox.token}/messages`)).status, 401);

  // An expired inbox that gets extended before the purge runs survives it.
  const kept = (await t.api("POST", "/v1/inboxes", { body: { ttl_hours: 0.0003 } })).json;
  // And issuing a new share link for an expired inbox revives it (the link must work).
  const revived = (await t.api("POST", "/v1/inboxes", { body: { ttl_hours: 0.0003 } })).json;
  await t.sleep(1500);
  const patched = await t.api("PATCH", `/v1/inboxes/${kept.address}`, { body: { ttl_hours: 1 } });
  assert.equal(patched.status, 200);
  const relink = await t.fetch(`/admin/inbox/${encodeURIComponent(revived.address)}/link`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: t.url, "sec-fetch-site": "same-origin" },
    body: "",
  });
  const newUrl = /http:\/\/127\.0\.0\.1:\d+\/i\/mm_in_[A-Za-z0-9_-]{32}/.exec(await relink.text())?.[0];
  assert.ok(newUrl);
  assert.equal((await t.fetch(`${newUrl}/messages`)).status, 200, "new link to an expired inbox works");

  const s = await t.triggerScheduled();
  assert.ok(s.status < 300, `scheduled ran: ${s.status} ${s.text}`);
  await t.sleep(500);
  assert.equal((await t.api("GET", `/v1/inboxes/${inbox.address}`)).status, 404, "purged");
  assert.equal((await t.api("GET", `/v1/inboxes/${kept.address}`)).status, 200, "extended inbox kept");
  assert.equal((await t.api("GET", `/v1/inboxes/${revived.address}`)).status, 200, "relinked inbox kept");

  // A purged API address that receives mail again becomes a fresh catch-all inbox.
  await t.sendEmail({ to: inbox.address, subject: "after purge", text: "hi" });
  const fresh = await t.api("GET", `/v1/inboxes/${inbox.address}`);
  assert.equal(fresh.json.origin, "auto");
  assert.equal(fresh.json.message_count, 1);
}
