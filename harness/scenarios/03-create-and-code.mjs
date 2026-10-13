export const name = "create inbox, receive OTP mail, code extracted";

export default async function (t) {
  const { assert } = t;
  const created = await t.api("POST", "/v1/inboxes", { body: { label: "github test" } });
  assert.equal(created.status, 201, created.text);
  const inbox = created.json;
  assert.match(inbox.address, /^[a-z]+-[a-z]+-[0-9a-z]{4}@aisocket\.dev$/);
  assert.match(inbox.token, /^bm_in_/);
  assert.equal(inbox.url, `${t.url}/i/${inbox.token}`);
  assert.equal(inbox.label, "github test");
  t.state.inbox = inbox;

  const sent = await t.sendEmail({
    from: "noreply@github.com",
    to: inbox.address,
    subject: "[GitHub] Please verify your device",
    text: "Hey there!\n\nA sign in attempt requires further verification.\n\nVerification code: 482913\n\nIf you did not attempt to sign in, change your password.\n\nThanks,\nThe GitHub Team",
  });
  assert.ok(sent.status < 300, `email accepted: ${sent.status} ${sent.text}`);

  const list = await t.api("GET", `/v1/inboxes/${inbox.address}/messages`);
  assert.equal(list.status, 200);
  assert.equal(list.json.messages.length, 1);
  const m = list.json.messages[0];
  assert.equal(m.code, "482913");
  assert.equal(m.from, "noreply@github.com");
  assert.equal(list.json.cursor, m.id);

  const full = await t.api("GET", `/v1/messages/${m.id}`);
  assert.equal(full.status, 200);
  assert.match(full.json.text, /Verification code: 482913/);
  assert.equal(full.json.inbox, inbox.address);

  // Newest-first pages cut off by `limit` don't advance the cursor past unseen mail.
  for (const n of [2, 3]) await t.sendEmail({ to: inbox.address, subject: `more ${n}`, text: "x" });
  const page = await t.api("GET", `/v1/inboxes/${inbox.address}/messages?limit=2`);
  assert.deepEqual(page.json.messages.map((x) => x.subject), ["more 3", "more 2"]);
  assert.equal(page.json.has_more, true);
  assert.equal(page.json.cursor, 0, "truncated desc page keeps since");
  const asc = await t.api("GET", `/v1/inboxes/${inbox.address}/messages?order=asc&limit=2`);
  assert.equal(asc.json.messages[0].id, m.id);
  const rest = await t.api("GET", `/v1/inboxes/${inbox.address}/messages?order=asc&since=${asc.json.cursor}`);
  assert.deepEqual(rest.json.messages.map((x) => x.subject), ["more 3"]);
  assert.equal(rest.json.has_more, false);

  // Bare name resolves to the default domain.
  const byName = await t.api("GET", `/v1/inboxes/${inbox.address.split("@")[0]}`);
  assert.equal(byName.status, 200);
  assert.equal(byName.json.message_count, 3);
}
