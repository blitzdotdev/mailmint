import type { CodeCandidate, LinkCandidate } from "../extract/index.ts";
import type { InboxRow } from "../store/inboxes.ts";
import { parseJson, type MessageRow, type StoredAttachment } from "../store/messages.ts";

/** URL base for one message's sub-resources, e.g. `/v1/messages/42` or `/i/<token>/messages/42`. */
export type MessageBase = (id: number) => string;

export function presentInbox(inbox: InboxRow, extra: { token?: string; url?: string } = {}) {
  return {
    address: inbox.address,
    origin: inbox.origin,
    label: inbox.label,
    created_at: inbox.created_at,
    expires_at: inbox.expires_at,
    message_count: inbox.message_count,
    last_message_at: inbox.last_message_at,
    ...(extra.token ? { token: extra.token } : {}),
    ...(extra.url ? { url: extra.url } : {}),
  };
}

export function presentMessageSummary(m: MessageRow, address: string, base: MessageBase) {
  const codes = parseJson<CodeCandidate[]>(m.codes_json, []);
  const links = parseJson<LinkCandidate[]>(m.links_json, []);
  const attachments = parseJson<StoredAttachment[]>(m.attachments_json, []);
  return {
    id: m.id,
    inbox: address,
    to: m.envelope_to,
    tag: m.tag,
    from: m.from_address ?? m.envelope_from,
    from_name: m.from_name,
    subject: m.subject,
    received_at: m.received_at,
    code: m.best_code,
    link: m.best_link,
    codes: codes.map((c) => c.value),
    links: links.map((l) => ({ url: l.url, kind: l.kind, text: l.text })),
    attachments: attachments.length,
    url: base(m.id),
  };
}

export function presentMessage(m: MessageRow, address: string, base: MessageBase) {
  const attachments = parseJson<StoredAttachment[]>(m.attachments_json, []);
  return {
    ...presentMessageSummary(m, address, base),
    text: m.text_body,
    has_html: m.html_body !== null || m.html_truncated === 1,
    html_url: `${base(m.id)}/html`,
    raw_url: `${base(m.id)}/raw`,
    size: m.size,
    attachments: attachments.map((a, index) => ({
      index,
      filename: a.filename,
      content_type: a.content_type,
      size: a.size,
      url: `${base(m.id)}/attachments/${index}`,
    })),
  };
}
