// Inbound mail. Parsing, fingerprinting, R2 layout and the Message-ID fallback are adapted from
// cf-mailroom (https://github.com/wong2/cf-mailroom, Apache-2.0) src/worker/email/receive.ts + rules.ts.

import PostalMime, { type Address, type Attachment } from "postal-mime";
import type { Env } from "../env.ts";
import { extract } from "../extract/index.ts";
import { parseHtml } from "../extract/html.ts";
import { parseAddress } from "../lib/address.ts";
import { config } from "../lib/config.ts";
import {
  deleteInbox,
  getInboxByAddress,
  insertInbox,
  isExpired,
  isoAfterHours,
  type InboxRow,
} from "../store/inboxes.ts";
import { bumpDailyCounter } from "../store/limits.ts";
import { insertMessage, type StoredAttachment } from "../store/messages.ts";
import { signalStub } from "../lib/signal-stub.ts";
import { fitBytes, utf8Length } from "../lib/text.ts";

/** HTML above this many UTF-8 bytes is not kept in D1; readers re-parse the raw .eml from R2. */
export const MAX_STORED_HTML = 512 * 1024;
/** Bytes, not characters: CJK text is ~3 bytes per character and D1 rows are size-limited. */
const MAX_STORED_TEXT = 256 * 1024;
const MAX_ATTACHMENTS = 20;

export async function receiveEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  const cfg = config(env);
  const recipient = parseAddress(message.to);
  if (!recipient || !cfg.domains.includes(recipient.domain)) {
    message.setReject("Unknown recipient");
    return;
  }
  if (message.rawSize > cfg.maxMessageBytes) {
    message.setReject("Message too large");
    return;
  }
  const inbox = await resolveInbox(env, recipient.address, cfg.acceptUnknown, cfg.maxAutoInboxesPerDay, cfg.autoTtlHours);
  if ("reject" in inbox) {
    message.setReject(inbox.reject);
    return;
  }
  if ((await bumpDailyCounter(env.DB, `inbox:${inbox.id}`)) > cfg.maxMessagesPerInboxPerDay) {
    message.setReject("Mailbox is over its daily limit");
    return;
  }
  // Counted only for mail we'd otherwise accept, so rejected floods (unknown addresses
  // in strict mode, over-cap inboxes) can't use up the whole instance's daily quota.
  if ((await bumpDailyCounter(env.DB, "messages")) > cfg.maxMessagesPerDay) {
    message.setReject("Mailbox service is over its daily limit, try again tomorrow");
    return;
  }

  const raw = await new Response(message.raw).arrayBuffer();
  const fingerprint = await sha256Hex(raw);
  const parsed = await PostalMime.parse(raw);

  const rawKey = `raw/${inbox.id}/${fingerprint}.eml`;
  await env.RAW.put(rawKey, raw, { httpMetadata: { contentType: "message/rfc822" } });
  const attachments = await storeAttachments(env, inbox.id, fingerprint, parsed.attachments);

  const subject = parsed.subject ?? "";
  const html = parsed.html ?? null;
  // HTML-only mail: derive text with the extractor's linear, size-capped parser.
  const text = parsed.text ?? (html ? parseHtml(html).text : null);
  const from = firstMailbox(parsed.from);
  const found = extract({ subject, text, html, from: from?.address ?? message.from });

  const id = await insertMessage(
    env.DB,
    {
      inboxId: inbox.id,
      rfcMessageId: parsed.messageId ?? `<raw-${fingerprint}@mailmint.invalid>`,
      envelopeFrom: message.from,
      envelopeTo: message.to.toLowerCase(),
      tag: recipient.tag,
      fromAddress: from?.address ?? null,
      fromName: from?.name || null,
      subject,
      textBody: text ? fitBytes(text, MAX_STORED_TEXT) : null,
      htmlBody: html && utf8Length(html) <= MAX_STORED_HTML ? html : null,
      htmlTruncated: !!html && utf8Length(html) > MAX_STORED_HTML,
      codes: found.codes,
      links: found.links,
      bestCode: found.best.code,
      bestLink: found.best.link,
      attachments,
      rawKey,
      size: raw.byteLength,
    },
    // Auto-created inboxes live AUTO_TTL_HOURS past their latest message.
    inbox.origin === "auto" ? isoAfterHours(cfg.autoTtlHours) : null,
  );
  if (id === null) return; // Redelivery of a message we already stored.

  try {
    await signalStub(env, inbox.id).signal(id);
  } catch (error) {
    // The message is stored; waiters still find it on their next D1 check.
    console.error("InboxSignal.signal failed", { inbox: inbox.id, error: String(error) });
  }
}

async function resolveInbox(
  env: Env,
  address: string,
  acceptUnknown: boolean,
  maxAutoPerDay: number,
  autoTtlHours: number,
): Promise<InboxRow | { reject: string }> {
  let inbox = await getInboxByAddress(env.DB, address);
  if (inbox && isExpired(inbox)) {
    if (inbox.origin === "api") return { reject: "Mailbox expired" };
    // An expired catch-all inbox is gone as far as anyone is concerned; start fresh.
    await deleteInbox(env, inbox, { onlyIfExpired: true });
    inbox = null;
  }
  if (inbox) return inbox;
  if (!acceptUnknown) return { reject: "Unknown recipient" };
  if ((await bumpDailyCounter(env.DB, "auto_inboxes")) > maxAutoPerDay) {
    return { reject: "Mailbox service is over its daily limit, try again tomorrow" };
  }
  const created = await insertInbox(env.DB, {
    address,
    tokenHash: null,
    origin: "auto",
    label: null,
    expiresAt: isoAfterHours(autoTtlHours),
  });
  // Lost a race with a concurrent delivery or API create: use the winner.
  return created ?? (await getInboxByAddress(env.DB, address)) ?? { reject: "Temporary failure" };
}

async function storeAttachments(
  env: Env,
  inboxId: number,
  fingerprint: string,
  attachments: Attachment[],
): Promise<StoredAttachment[]> {
  const stored: StoredAttachment[] = [];
  for (const [index, attachment] of attachments.slice(0, MAX_ATTACHMENTS).entries()) {
    const bytes = attachmentBytes(attachment.content);
    const key = `att/${inboxId}/${fingerprint}/${index}`;
    const contentType = attachment.mimeType || "application/octet-stream";
    await env.RAW.put(key, bytes, {
      httpMetadata: { contentType },
      customMetadata: attachment.filename ? { filename: attachment.filename } : undefined,
    });
    stored.push({
      filename: attachment.filename ?? null,
      content_type: contentType,
      size: bytes.byteLength,
      key,
      disposition: attachment.disposition ?? null,
      content_id: attachment.contentId ?? null,
    });
  }
  return stored;
}

function firstMailbox(address: Address | undefined): { address: string; name: string } | null {
  if (!address) return null;
  if ("group" in address && address.group) {
    const first = address.group[0];
    return first ? { address: first.address.trim().toLowerCase(), name: first.name } : null;
  }
  return "address" in address && address.address
    ? { address: address.address.trim().toLowerCase(), name: address.name }
    : null;
}

function attachmentBytes(content: ArrayBuffer | Uint8Array | string): Uint8Array {
  if (typeof content === "string") return new TextEncoder().encode(content);
  return content instanceof Uint8Array ? content : new Uint8Array(content);
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

