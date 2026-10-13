export const name = "redelivery dedup, attachments, raw download, large HTML";

export default async function (t) {
  const { assert } = t;
  const inbox = (await t.api("POST", "/v1/inboxes", { body: {} })).json;
  const raw = t.buildEml({ to: inbox.address, subject: "once", text: "only once", messageId: "<fixed-id-1@example.com>" });
  await t.sendEmail({ to: inbox.address, raw });
  await t.sendEmail({ to: inbox.address, raw });
  let list = (await t.api("GET", `/v1/inboxes/${inbox.address}/messages`)).json.messages;
  assert.equal(list.length, 1, "same Message-ID stored once");

  const b = "mixedboundary";
  const withAttachment = [
    "From: files@example.com",
    `To: ${inbox.address}`,
    "Subject: report",
    "Message-ID: <att-1@example.com>",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${b}"`,
    "",
    `--${b}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "see attached",
    `--${b}`,
    'Content-Type: text/csv; name="data.csv"',
    'Content-Disposition: attachment; filename="data.csv"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("a,b\n1,2\n").toString("base64"),
    `--${b}--`,
    "",
  ].join("\r\n");
  await t.sendEmail({ to: inbox.address, raw: withAttachment, from: "files@example.com" });
  const m = (await t.api("GET", `/v1/inboxes/${inbox.address}/wait?subject=report&timeout=1`)).json.message;
  assert.equal(m.attachments.length, 1);
  assert.equal(m.attachments[0].filename, "data.csv");
  const att = await t.fetch(m.attachments[0].url, { headers: { authorization: `Bearer ${t.state.key}` } });
  assert.equal(att.status, 200);
  assert.equal(att.headers.get("content-type"), "application/octet-stream");
  assert.equal(await att.text(), "a,b\n1,2\n");

  const rawRes = await t.fetch(m.raw_url, { headers: { authorization: `Bearer ${t.state.key}` } });
  assert.equal(rawRes.status, 200);
  assert.match(await rawRes.text(), /Subject: report/);

  // HTML over the D1 cap is served by re-parsing the raw message.
  const big = "<p>" + "x".repeat(600 * 1024) + "</p><p>END-MARKER</p>";
  await t.sendEmail({ to: inbox.address, subject: "big html", html: big });
  const bigMsg = (await t.api("GET", `/v1/inboxes/${inbox.address}/wait?subject=big&timeout=1`)).json.message;
  assert.equal(bigMsg.has_html, true);
  const bigHtml = await (await t.fetch(bigMsg.html_url, { headers: { authorization: `Bearer ${t.state.key}` } })).text();
  assert.ok(bigHtml.includes("END-MARKER"));
}
