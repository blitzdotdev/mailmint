// Runs its own wrangler dev instances with different vars.
export const name = "strict mode and abuse caps (separate instances)";

async function deliver(url, to, { subject = "x", text = "hello", size = 0 } = {}) {
  const body = [
    "From: s@example.com",
    `To: ${to}`,
    `Subject: ${subject}`,
    `Message-ID: <lim-${Date.now()}-${Math.random()}@example.com>`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    text + "y".repeat(size),
    "",
  ].join("\r\n");
  const res = await fetch(`${url}/cdn-cgi/handler/email?${new URLSearchParams({ from: "s@example.com", to })}`, {
    method: "POST",
    headers: { "content-type": "message/rfc822" },
    body,
  });
  return { status: res.status, text: await res.text() };
}

const rejected = (r) => r.status >= 400 || /reject/i.test(r.text);

async function ownerKey(url) {
  const res = await fetch(`${url}/admin/keys`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: url, "sec-fetch-site": "same-origin" },
    body: "name=limits",
  });
  return /bm_key_[A-Za-z0-9_-]{32}/.exec(await res.text())[0];
}

export default async function (t) {
  const { assert } = t;

  const strict = await t.state.startDev({ vars: { ACCEPT_UNKNOWN: "0" }, label: "strict" });
  try {
    const r = await deliver(strict.url, "nobody-made-this@aisocket.dev");
    assert.ok(rejected(r), `unknown address rejected in strict mode: ${r.status} ${r.text}`);
    const key = await ownerKey(strict.url);
    const created = await (await fetch(`${strict.url}/v1/inboxes`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ local: "made-this" }),
    })).json();
    const ok = await deliver(strict.url, created.address);
    assert.ok(!rejected(ok), `created address accepted: ${ok.status} ${ok.text}`);
  } finally {
    strict.stop();
  }

  const capped = await t.state.startDev({
    vars: { MAX_AUTO_INBOXES_PER_DAY: "2", MAX_MESSAGES_PER_INBOX_PER_DAY: "2", MAX_MESSAGE_BYTES: "4000" },
    label: "capped",
  });
  try {
    assert.ok(!rejected(await deliver(capped.url, "a1@aisocket.dev")));
    assert.ok(!rejected(await deliver(capped.url, "a2@aisocket.dev")));
    assert.ok(rejected(await deliver(capped.url, "a3@aisocket.dev")), "third auto inbox of the day rejected");

    assert.ok(!rejected(await deliver(capped.url, "a1@aisocket.dev")), "2nd message to a1");
    assert.ok(rejected(await deliver(capped.url, "a1@aisocket.dev")), "3rd message to a1 over per-inbox cap");

    assert.ok(rejected(await deliver(capped.url, "a2@aisocket.dev", { size: 8000 })), "oversized message rejected");
  } finally {
    capped.stop();
  }
}
