export const name = "agents.md / landing content negotiation";

export default async function (t) {
  const { assert } = t;
  const md = await t.fetch("/");
  assert.equal(md.status, 200);
  assert.match(md.headers.get("content-type"), /text\/markdown/);
  assert.match(await md.text(), /mailmint/);
  const html = await t.fetch("/", { headers: { accept: "text/html" } });
  assert.match(html.headers.get("content-type"), /text\/html/);
  assert.match(html.headers.get("content-security-policy"), /script-src 'self'/);
  for (const p of ["/agents.md", "/llms.txt", "/skill.md", "/.well-known/agents.md"]) {
    const r = await t.fetch(p);
    assert.equal(r.status, 200, p);
  }
  assert.match(await (await t.fetch("/skill.md")).text(), /^---\nname: mailmint/);
  const nf = await t.api("GET", "/nope", { key: null });
  assert.equal(nf.status, 404);
  assert.equal(nf.json.error.code, "not_found");
}
