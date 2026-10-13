import type { Env } from "../env.ts";
import { signalStub } from "../lib/signal-stub.ts";

export interface InboxRow {
  id: number;
  address: string;
  token_hash: string | null;
  origin: "api" | "auto";
  label: string | null;
  created_at: string;
  expires_at: string;
  message_count: number;
  last_message_at: string | null;
}

const COLUMNS =
  "id, address, token_hash, origin, label, created_at, expires_at, message_count, last_message_at";

export function isoAfterHours(hours: number, from = Date.now()): string {
  return new Date(from + hours * 3600_000).toISOString();
}

export function isExpired(inbox: Pick<InboxRow, "expires_at">, now = Date.now()): boolean {
  return Date.parse(inbox.expires_at) <= now;
}

export async function getInboxByAddress(db: D1Database, address: string): Promise<InboxRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM inboxes WHERE address = ?`).bind(address).first<InboxRow>();
}

export async function getInboxById(db: D1Database, id: number): Promise<InboxRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM inboxes WHERE id = ?`).bind(id).first<InboxRow>();
}

export async function getInboxByTokenHash(db: D1Database, hash: string): Promise<InboxRow | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM inboxes WHERE token_hash = ?`).bind(hash).first<InboxRow>();
}

/** Insert; returns null if the address already exists. */
export async function insertInbox(
  db: D1Database,
  input: { address: string; tokenHash: string | null; origin: "api" | "auto"; label: string | null; expiresAt: string },
): Promise<InboxRow | null> {
  return db
    .prepare(
      `INSERT INTO inboxes (address, token_hash, origin, label, expires_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (address) DO NOTHING
       RETURNING ${COLUMNS}`,
    )
    .bind(input.address, input.tokenHash, input.origin, input.label, input.expiresAt)
    .first<InboxRow>();
}

/**
 * Turn an auto-created inbox (no token yet) into an API inbox with a token.
 * Conditional on token_hash IS NULL so two concurrent claims can't both win.
 */
export async function claimInbox(
  db: D1Database,
  id: number,
  input: { tokenHash: string; label: string | null; expiresAt: string },
): Promise<InboxRow | null> {
  return db
    .prepare(
      `UPDATE inboxes SET token_hash = ?, origin = 'api', label = COALESCE(?, label), expires_at = ?
       WHERE id = ? AND token_hash IS NULL
       RETURNING ${COLUMNS}`,
    )
    .bind(input.tokenHash, input.label, input.expiresAt, id)
    .first<InboxRow>();
}

/**
 * Issue a new capability token (the old link stops working). A catch-all inbox
 * becomes an API inbox with the given expiry; an API inbox keeps its expiry
 * unless it already expired (a fresh link to a dead inbox would never work).
 */
export async function setInboxToken(
  db: D1Database,
  id: number,
  input: { tokenHash: string; autoExpiresAt: string },
): Promise<InboxRow | null> {
  return db
    .prepare(
      `UPDATE inboxes SET token_hash = ?1,
         expires_at = CASE WHEN origin = 'auto' OR expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') THEN ?2 ELSE expires_at END,
         origin = 'api'
       WHERE id = ?3
       RETURNING ${COLUMNS}`,
    )
    .bind(input.tokenHash, input.autoExpiresAt, id)
    .first<InboxRow>();
}

export async function updateInbox(
  db: D1Database,
  id: number,
  input: { label?: string | null; expiresAt?: string },
): Promise<InboxRow | null> {
  return db
    .prepare(
      `UPDATE inboxes SET
         label = CASE WHEN ?1 THEN ?2 ELSE label END,
         expires_at = COALESCE(?3, expires_at)
       WHERE id = ?4
       RETURNING ${COLUMNS}`,
    )
    .bind(input.label !== undefined ? 1 : 0, input.label ?? null, input.expiresAt ?? null, id)
    .first<InboxRow>();
}

export async function listInboxes(
  db: D1Database,
  options: { limit: number; query?: string | null },
): Promise<InboxRow[]> {
  const q = options.query?.trim().toLowerCase();
  const { results } = q
    ? await db
        .prepare(
          `SELECT ${COLUMNS} FROM inboxes WHERE address LIKE ? OR label LIKE ?
           ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT ?`,
        )
        .bind(`%${q}%`, `%${q}%`, options.limit)
        .all<InboxRow>()
    : await db
        .prepare(`SELECT ${COLUMNS} FROM inboxes ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT ?`)
        .bind(options.limit)
        .all<InboxRow>();
  return results;
}

export async function expiredInboxes(db: D1Database, limit: number): Promise<InboxRow[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM inboxes WHERE expires_at <= ? ORDER BY expires_at LIMIT ?`)
    .bind(new Date().toISOString(), limit)
    .all<InboxRow>();
  return results;
}

/** R2 key prefixes owned by an inbox. Everything stored for it lives under these. */
export function inboxPrefixes(inboxId: number): string[] {
  return [`raw/${inboxId}/`, `att/${inboxId}/`];
}

/**
 * Delete an inbox completely: the row (messages cascade), its R2 objects and its
 * signal state. Returns false if nothing was deleted.
 *
 * `onlyIfExpired` (purge, expired catch-all on delivery) makes the row delete
 * conditional on the inbox *still* being expired, so an extension that lands
 * after the expired row was read wins over the purge.
 */
export async function deleteInbox(
  env: Env,
  inbox: Pick<InboxRow, "id">,
  options: { onlyIfExpired?: boolean } = {},
): Promise<boolean> {
  const deleted = options.onlyIfExpired
    ? await env.DB.prepare("DELETE FROM inboxes WHERE id = ? AND expires_at <= ? RETURNING id")
        .bind(inbox.id, new Date().toISOString())
        .first()
    : await env.DB.prepare("DELETE FROM inboxes WHERE id = ? RETURNING id").bind(inbox.id).first();
  if (!deleted) return false;
  for (const prefix of inboxPrefixes(inbox.id)) {
    let cursor: string | undefined;
    do {
      const page = await env.RAW.list({ prefix, cursor, limit: 1000 });
      if (page.objects.length > 0) await env.RAW.delete(page.objects.map((o) => o.key));
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  await signalStub(env, inbox.id).reset();
  return true;
}
