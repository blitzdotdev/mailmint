export const name = "wait blocks and wakes immediately when mail lands";

export default async function (t) {
  const { assert } = t;
  const inbox = (await t.api("POST", "/v1/inboxes", { body: {} })).json;

  // Already-present mail returns at once.
  await t.sendEmail({ to: inbox.address, subject: "first", text: "Your code is 111222" });
  let started = Date.now();
  let r = await t.api("GET", `/v1/inboxes/${inbox.address}/wait?timeout=20`);
  assert.equal(r.status, 200);
  assert.equal(r.json.message.subject, "first");
  assert.ok(Date.now() - started < 3000, "immediate");
  const cursor = r.json.cursor;

  // Nothing new: start waiting, deliver 1.5s later, the wait returns right after.
  started = Date.now();
  const pending = t.api("GET", `/v1/inboxes/${inbox.address}/wait?since=${cursor}&timeout=20&extract=code`);
  await t.sleep(1500);
  await t.sendEmail({ to: inbox.address, subject: "second", text: "Your verification code is 333444" });
  r = await pending;
  const elapsed = Date.now() - started;
  assert.equal(r.json.timed_out, false);
  assert.equal(r.json.message.code, "333444");
  assert.ok(elapsed >= 1400 && elapsed < 5000, `woke promptly (${elapsed}ms)`);

  // since=latest ignores everything already there.
  started = Date.now();
  r = await t.api("GET", `/v1/inboxes/${inbox.address}/wait?since=latest&timeout=2`);
  assert.equal(r.json.timed_out, true);
  assert.equal(r.json.message, null);
  assert.ok(Date.now() - started >= 1900, "waited the timeout");
  assert.ok(r.json.cursor >= cursor);

  // Concurrent waiters on the same inbox all wake.
  const since = r.json.cursor;
  const waits = [1, 2, 3].map(() => t.api("GET", `/v1/inboxes/${inbox.address}/wait?since=${since}&timeout=20`));
  await t.sleep(800);
  await t.sendEmail({ to: inbox.address, subject: "third", text: "hello" });
  for (const w of await Promise.all(waits)) assert.equal(w.json.message.subject, "third");
}
