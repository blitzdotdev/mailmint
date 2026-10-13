export const name = "catch-all: unknown address auto-creates an owner-only inbox; claiming keeps mail";

export default async function (t) {
  const { assert } = t;
  const address = `random-${Date.now()}@aisocket.dev`;
  const sent = await t.sendEmail({ to: address, subject: "Welcome", text: "Your code: 246810" });
  assert.ok(sent.status < 300, sent.text);

  const inbox = await t.api("GET", `/v1/inboxes/${address}`);
  assert.equal(inbox.status, 200);
  assert.equal(inbox.json.origin, "auto");
  const hoursLeft = (Date.parse(inbox.json.expires_at) - Date.now()) / 3600_000;
  assert.ok(hoursLeft > 23 && hoursLeft <= 24.01, `auto TTL ~24h (${hoursLeft})`);

  // Claim it through the API: same address, gets a token, keeps its message.
  const claimed = await t.api("POST", "/v1/inboxes", { body: { local: address } });
  assert.equal(claimed.status, 201, claimed.text);
  assert.equal(claimed.json.origin, "api");
  assert.equal(claimed.json.message_count, 1);
  const viaLink = await t.fetch(`/i/${claimed.json.token}/messages`);
  assert.equal((await viaLink.json()).messages[0].code, "246810");

  // A second create of the same address is a conflict now.
  const again = await t.api("POST", "/v1/inboxes", { body: { local: address } });
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, "address_taken");

  // Other domains are rejected at SMTP time.
  const foreign = await t.sendEmail({ to: "someone@not-ours.example", text: "x" });
  assert.ok(foreign.status >= 400 || /reject/i.test(foreign.text), `rejected: ${foreign.status} ${foreign.text}`);
}
