import type { CodeCandidate, LinkCandidate } from "../extract/index.ts";

export interface MessageRow {
  id: number;
  inbox_id: number;
  rfc_message_id: string;
  envelope_from: string;
  envelope_to: string;
  tag: string | null;
  from_address: string | null;
  from_name: string | null;
  subject: string;
  text_body: string | null;
  html_body: string | null;
  html_truncated: number;
  codes_json: string;
  links_json: string;
  best_code: string | null;
  best_link: string | null;
  attachments_json: string;
  raw_key: string;
  size: number;
  received_at: string;
}

export interface StoredAttachment {
  filename: string | null;
  content_type: string;
  size: number;
  key: string;
  disposition: string | null;
  content_id: string | null;
}

const SUMMARY_COLUMNS =
  "id, inbox_id, rfc_message_id, envelope_from, envelope_to, tag, from_address, from_name, subject, " +
  "NULL AS text_body, NULL AS html_body, html_truncated, codes_json, links_json, best_code, best_link, " +
  "attachments_json, raw_key, size, received_at";
const ALL_COLUMNS =
  "id, inbox_id, rfc_message_id, envelope_from, envelope_to, tag, from_address, from_name, subject, " +
  "text_body, html_body, html_truncated, codes_json, links_json, best_code, best_link, " +
  "attachments_json, raw_key, size, received_at";

export interface NewMessage {
  inboxId: number;
  rfcMessageId: string;
  envelopeFrom: string;
  envelopeTo: string;
  tag: string | null;
  fromAddress: string | null;
  fromName: string | null;
  subject: string;
  textBody: string | null;
  htmlBody: string | null;
  htmlTruncated: boolean;
  codes: CodeCandidate[];
  links: LinkCandidate[];
  bestCode: string | null;
  bestLink: string | null;
  attachments: StoredAttachment[];
  rawKey: string;
  size: number;
}

/**
 * Insert and bump the inbox counters. Returns the new id, or null
 * if this inbox already has a message with the same Message-ID (redelivery).
 */
export async function insertMessage(
  db: D1Database,
  m: NewMessage,
  inboxExpiresAt: string | null,
): Promise<number | null> {
  const now = new Date().toISOString();
  const inserted = await db
    .prepare(
      `INSERT INTO messages (inbox_id, rfc_message_id, envelope_from, envelope_to, tag, from_address, from_name,
         subject, text_body, html_body, html_truncated, codes_json, links_json, best_code, best_link,
         attachments_json, raw_key, size, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (inbox_id, rfc_message_id) DO NOTHING
       RETURNING id`,
    )
    .bind(
      m.inboxId, m.rfcMessageId, m.envelopeFrom, m.envelopeTo, m.tag, m.fromAddress, m.fromName,
      m.subject, m.textBody, m.htmlBody, m.htmlTruncated ? 1 : 0, JSON.stringify(m.codes),
      JSON.stringify(m.links), m.bestCode, m.bestLink, JSON.stringify(m.attachments), m.rawKey, m.size, now,
    )
    .first<{ id: number }>();
  if (!inserted) return null;
  await db
    .prepare(
      `UPDATE inboxes SET message_count = message_count + 1, last_message_at = ?,
         expires_at = COALESCE(?, expires_at)
       WHERE id = ?`,
    )
    .bind(now, inboxExpiresAt, m.inboxId)
    .run();
  return inserted.id;
}

export async function listMessages(
  db: D1Database,
  inboxId: number,
  options: { since: number; limit: number; order: "asc" | "desc" },
): Promise<MessageRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM messages WHERE inbox_id = ? AND id > ?
       ORDER BY id ${options.order === "asc" ? "ASC" : "DESC"} LIMIT ?`,
    )
    .bind(inboxId, options.since, options.limit)
    .all<MessageRow>();
  return results;
}

export async function getMessage(db: D1Database, id: number): Promise<MessageRow | null> {
  return db.prepare(`SELECT ${ALL_COLUMNS} FROM messages WHERE id = ?`).bind(id).first<MessageRow>();
}

export async function latestMessageId(db: D1Database, inboxId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COALESCE(MAX(id), 0) AS id FROM messages WHERE inbox_id = ?")
    .bind(inboxId)
    .first<{ id: number }>();
  return row?.id ?? 0;
}

export function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
