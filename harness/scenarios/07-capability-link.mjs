export const name = "capability link: one inbox, no key, page + agents.md + isolation";

export default async function (t) {
  const { assert } = t;
  const a = (await t.api("POST", "/v1/inboxes", { body: {} })).json;
  const b = (await t.api("POST", "/v1/inboxes", { body: {} })).json;
  await t.sendEmail({ to: a.address, subject: "for A", text: "code 135790 is your code" });
  await t.sendEmail({ to: b.address, subject: "for B", text: "hi B" });
  const base = `/i/${a.token}`;

  const md = await t.fetch(`${base}/agents.md`);
  assert.equal(md.status, 200);
  const mdText = await md.text();
  assert.ok(mdText.includes(a.address));
  assert.ok(mdText.includes(`${t.url}${base}`));
  // Agents fetching the bare link (no text/html Accept) get the markdown card too.
  assert.match(await (await t.fetch(base)).text(), /# Inbox /);

  const page = await t.fetch(base, { headers: { accept: "text/html" } });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes("135790"), "page shows the code");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");

  const wait = await (await t.fetch(`${base}/wait?extract=code&timeout=1`)).json();
  assert.equal(wait.message.code, "135790");
  assert.ok(wait.message.url.startsWith(`${base}/messages/`));

  // Message ids from another inbox are invisible through this link.
  const bMsg = (await t.api("GET", `/v1/inboxes/${b.address}/messages`)).json.messages[0];
  const cross = await t.fetch(`${base}/messages/${bMsg.id}`);
  assert.equal(cross.status, 404);

  // The inbox token works as a Bearer for its own inbox on /v1, not for others or for owner ops.
  const own = await t.api("GET", `/v1/inboxes/${a.address}/messages`, { key: a.token });
  assert.equal(own.status, 200);
  const other = await t.api("GET", `/v1/inboxes/${b.address}/messages`, { key: a.token });
  assert.equal(other.status, 404);
  const create = await t.api("POST", "/v1/inboxes", { key: a.token, body: {} });
  assert.equal(create.status, 403);
  const list = await t.api("GET", "/v1/inboxes", { key: a.token });
  assert.deepEqual(list.json.inboxes.map((i) => i.address), [a.address]);

  // HTML body is served sandboxed.
  await t.sendEmail({
    to: a.address,
    subject: "html",
    html: '<meta name="referrer" content="unsafe-url"><p>hi</p><script>alert(1)</script><img src="https://tracker.example/p.gif" referrerpolicy="unsafe-url"><a href="https://x.example" referrerpolicy=unsafe-url>x</a>',
  });
  const htmlMsg = (await (await t.fetch(`${base}/messages?limit=1`)).json()).messages[0];
  const body = await t.fetch(`${base}/messages/${htmlMsg.id}/html`);
  const csp = body.headers.get("content-security-policy");
  assert.match(csp, /sandbox/);
  assert.ok(!/allow-scripts/.test(csp));
  assert.match(csp, /img-src data:(;|$)/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /form-action 'none'/);
  assert.equal(body.headers.get("referrer-policy"), "no-referrer");
  const served = await body.text();
  assert.ok(!/unsafe-url/i.test(served), "email cannot loosen the referrer policy");
  assert.match(served, /<meta name="referrer" content="no-referrer">/);

  // Burn it via the link.
  const del = await t.fetch(base, { method: "DELETE" });
  assert.equal(del.status, 200);
  assert.equal((await t.fetch(`${base}/messages`)).status, 401);
  assert.equal((await t.api("GET", `/v1/inboxes/${a.address}`)).status, 404);
}
