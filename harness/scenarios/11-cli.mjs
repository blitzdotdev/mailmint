export const name = "CLI: login, new, wait --code/--link, ls, read, rm, share link";

export default async function (t) {
  const { assert } = t;
  let r = await t.cli(["login", "--url", t.url, "--key", t.state.key]);
  assert.equal(r.code, 0, r.stderr);
  r = await t.cli(["whoami"]);
  assert.match(r.stdout, /owner: harness/);

  r = await t.cli(["new", "--label", "cli test", "--ttl", "2h"]);
  assert.equal(r.code, 0, r.stderr);
  const address = r.stdout;
  assert.match(address, /@aisocket\.dev$/);

  const waiting = t.cli(["wait", address, "--code", "--timeout", "20s"]);
  await t.sleep(1200);
  await t.sendEmail({ from: "auth@service.example", to: address, subject: "Your sign-in code", text: "Your sign-in code is 552011. It expires in 10 minutes." });
  r = await waiting;
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, "552011");

  await t.sendEmail({ to: address, subject: "Verify", html: '<a href="https://svc.example/confirm/xyz">Confirm my email</a>' });
  r = await t.cli(["wait", address, "--link", "--timeout", "5s"]);
  assert.equal(r.stdout, "https://svc.example/confirm/xyz");

  r = await t.cli(["wait", address, "--from", "nobody", "--since", "latest", "--timeout", "2s"]);
  assert.equal(r.code, 2, "timeout exit code");

  r = await t.cli(["ls", address, "--json"]);
  const msgs = JSON.parse(r.stdout).messages;
  assert.equal(msgs.length, 2);
  r = await t.cli(["read", String(msgs[1].id)]);
  assert.match(r.stdout, /Code: 552011/);

  r = await t.cli(["ls"]);
  assert.ok(r.stdout.includes(address));

  // Share link works with no key at all.
  const inbox = (await t.api("POST", "/v1/inboxes", { body: {} })).json;
  await t.sendEmail({ to: inbox.address, subject: "code", text: "Your verification code is 864200" });
  r = await t.cli(["wait", inbox.url, "--code", "--timeout", "5s"], { BURNERMAIL_KEY: "", BURNERMAIL_URL: "", BURNERMAIL_CONFIG: "/nonexistent/config.json" });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.stdout, "864200");

  r = await t.cli(["rm", address]);
  assert.match(r.stdout, /deleted/);
  r = await t.cli(["ls", address]);
  assert.equal(r.code, 1);
}
