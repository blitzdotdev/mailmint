#!/usr/bin/env node
// Turn a real captured email into an extractor fixture: keep the service's real wording, HTML
// structure and URL shapes, scrub what identifies or authorizes anything.
//   node scripts/capture-fixture.mjs <raw.eml> <fixture-name>
// Writes worker/tests/fixtures/extract/<fixture-name>.eml. One-time codes are kept (they are
// long expired and are what the test checks); long tokens and our address are replaced.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import PostalMime from "postal-mime";

const [src, name] = process.argv.slice(2);
if (!src || !name || !/^[a-z0-9-]+$/.test(name)) {
  console.error("usage: capture-fixture.mjs <raw.eml> <fixture-name>");
  process.exit(2);
}
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mail = await PostalMime.parse(readFileSync(src));

const TOKEN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** Same length and character classes, deterministic per input, never the original. */
function fake(token) {
  const seed = createHash("sha256").update(`mailmint-fixture:${token}`).digest();
  let out = "";
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    const b = seed[i % seed.length] ^ i;
    if (/[0-9]/.test(c)) out += String(b % 10);
    else if (/[a-z]/.test(c)) out += TOKEN_CHARS[26 + (b % 26)];
    else if (/[A-Z]/.test(c)) out += TOKEN_CHARS[b % 26];
    else out += c;
  }
  return out;
}

const ADDRESS = /[a-z0-9._+-]+@aisocket\.dev/gi;
// Long random-looking runs (path segments, query values, fragments): ≥ 20 chars mixing
// letters and digits. Plain words and short numeric codes are left alone.
const LONG_TOKEN = /[A-Za-z0-9_-]{20,}/g;
// Shorter hex IDs (open-tracking pixels, message ids): 12+ hex chars mixing letters and digits.
const HEX_ID = /\b[0-9a-f]{12,}\b/g;

function scrub(text) {
  if (!text) return text;
  return text
    .replace(ADDRESS, "test-inbox@aisocket.dev")
    .replace(/[a-z0-9._+-]+%40aisocket\.dev/gi, "test-inbox%40aisocket.dev")
    .replace(LONG_TOKEN, (t) => (/\d/.test(t) && /[A-Za-z]/.test(t) ? fake(t) : t))
    .replace(HEX_ID, (t) => (/\d/.test(t) && /[a-f]/.test(t) ? fake(t) : t));
}

// Per-recipient sender addresses (`no-reply-<id>@…`) identify the capture too.
const fromAddress = mail.from?.address
  ? mail.from.address.replace(/[A-Za-z0-9_]{8,}/g, (t) => (/\d/.test(t) && /[A-Za-z]/.test(t) ? fake(t) : t))
  : "unknown@example.com";
const from = mail.from?.name ? `${mail.from.name} <${fromAddress}>` : fromAddress;
const boundary = `fixture-${createHash("sha1").update(name).digest("hex").slice(0, 12)}`;
const b64 = (s) => Buffer.from(s, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
const encodedSubject = `=?UTF-8?B?${Buffer.from(mail.subject ?? "", "utf8").toString("base64")}?=`;

const parts = [];
if (mail.text) parts.push(["text/plain", scrub(mail.text)]);
if (mail.html) parts.push(["text/html", scrub(mail.html)]);
const eml = [
  `From: ${from}`,
  "To: test-inbox@aisocket.dev",
  `Subject: ${encodedSubject}`,
  `Date: ${new Date(mail.date ?? Date.now()).toUTCString()}`,
  `Message-ID: <${name}-fixture@mailmint.invalid>`,
  "X-Mailmint-Fixture: real capture (headless sign-up via scripts/signup-e2e.mjs), tokens and address scrubbed",
  "MIME-Version: 1.0",
  `Content-Type: multipart/alternative; boundary="${boundary}"`,
  "",
  ...parts.flatMap(([type, body]) => [
    `--${boundary}`,
    `Content-Type: ${type}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
    "",
    b64(body),
  ]),
  `--${boundary}--`,
  "",
].join("\r\n");
const out = join(root, "worker/tests/fixtures/extract", `${name}.eml`);
writeFileSync(out, eml);
console.log(`wrote ${out}`);
