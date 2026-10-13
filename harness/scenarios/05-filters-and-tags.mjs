export const name = "wait filters (from, subject, tag, extract) and plus-addressing";

export default async function (t) {
  const { assert } = t;
  const inbox = (await t.api("POST", "/v1/inboxes", { body: { local: `filters-${Date.now()}` } })).json;
  const [local, domain] = inbox.address.split("@");

  await t.sendEmail({ from: "news@shop.example", to: inbox.address, subject: "Weekly deals", text: "Save $25 on order #884422 until 2026" });
  await t.sendEmail({ from: "no-reply@accounts.example", to: `${local}+acme@${domain}`, subject: "Confirm your email", html: '<p>Welcome!</p><a href="https://acme.example/verify?token=abc123">Verify email</a>' });
  await t.sendEmail({ from: "security@bank.example", to: inbox.address, subject: "Login code", text: "Your one-time passcode is 908172. It expires in 10 minutes." });

  let r = await t.api("GET", `/v1/inboxes/${inbox.address}/wait?extract=code&timeout=1`);
  assert.equal(r.json.message.code, "908172", "newsletter numbers are not codes");

  r = await t.api("GET", `/v1/inboxes/${inbox.address}/wait?extract=link&timeout=1`);
  assert.equal(r.json.message.link, "https://acme.example/verify?token=abc123");
  assert.equal(r.json.message.tag, "acme");
  assert.equal(r.json.message.to, `${local}+acme@${domain}`);

  r = await t.api("GET", `/v1/inboxes/${inbox.address}/wait?tag=acme&timeout=1`);
  assert.equal(r.json.message.subject, "Confirm your email");

  r = await t.api("GET", `/v1/inboxes/${inbox.address}/wait?from=bank&timeout=1`);
  assert.equal(r.json.message.subject, "Login code");

  r = await t.api("GET", `/v1/inboxes/${inbox.address}/wait?subject=weekly&timeout=1`);
  assert.equal(r.json.message.from, "news@shop.example");
  assert.equal(r.json.message.code, null);

  r = await t.api("GET", `/v1/inboxes/${inbox.address}/wait?from=nobody&timeout=1`);
  assert.equal(r.json.timed_out, true);

  const bad = await t.api("GET", `/v1/inboxes/${inbox.address}/wait?extract=nope`);
  assert.equal(bad.status, 400);
  const unknown = await t.api("GET", `/v1/inboxes/${inbox.address}/wait?form=x`);
  assert.equal(unknown.status, 400);
  assert.equal(unknown.json.error.code, "unknown_field");
}
