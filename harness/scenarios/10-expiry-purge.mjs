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

  const s = await t.triggerScheduled();
  assert.ok(s.status < 300, `scheduled ran: ${s.status} ${s.text}`);
  await t.sleep(500);
  assert.equal((await t.api("GET", `/v1/inboxes/${inbox.address}`)).status, 404, "purged");

  // A purged API address that receives mail again becomes a fresh catch-all inbox.
  await t.sendEmail({ to: inbox.address, subject: "after purge", text: "hi" });
  const fresh = await t.api("GET", `/v1/inboxes/${inbox.address}`);
  assert.equal(fresh.json.origin, "auto");
  assert.equal(fresh.json.message_count, 1);
}
