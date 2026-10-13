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

  // Bare name resolves to the default domain.
  const byName = await t.api("GET", `/v1/inboxes/${inbox.address.split("@")[0]}`);
  assert.equal(byName.status, 200);
  assert.equal(byName.json.message_count, 1);
}
