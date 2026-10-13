import { API_KEY_PREFIX, newApiKey, sha256Hex } from "../lib/tokens.ts";

export interface ApiKeyRow {
  id: number;
  name: string;
  prefix: string;
  created_at: string;
  created_by: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Create a key; the raw value is returned once and never stored. */
export async function createApiKey(
  db: D1Database,
  name: string,
  createdBy: string | null,
): Promise<{ key: string; row: ApiKeyRow }> {
  const key = newApiKey();
  const row = await db
    .prepare(
      `INSERT INTO api_keys (name, key_hash, prefix, created_by) VALUES (?, ?, ?, ?)
       RETURNING id, name, prefix, created_at, created_by, last_used_at, revoked_at`,
    )
    .bind(name, await sha256Hex(key), key.slice(0, API_KEY_PREFIX.length + 4), createdBy)
    .first<ApiKeyRow>();
  if (!row) throw new Error("API key insert returned no row");
  return { key, row };
}

export async function findActiveApiKey(db: D1Database, key: string): Promise<ApiKeyRow | null> {
  return db
    .prepare(
      `SELECT id, name, prefix, created_at, created_by, last_used_at, revoked_at
       FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`,
    )
    .bind(await sha256Hex(key))
    .first<ApiKeyRow>();
}

export async function listApiKeys(db: D1Database): Promise<ApiKeyRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, prefix, created_at, created_by, last_used_at, revoked_at
       FROM api_keys ORDER BY revoked_at IS NOT NULL, id DESC`,
    )
    .all<ApiKeyRow>();
  return results;
}

export async function revokeApiKey(db: D1Database, id: number): Promise<boolean> {
  const r = await db
    .prepare("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), id)
    .run();
  return r.meta.changes === 1;
}

/** Throttled to one write per key per 10 minutes. */
export async function touchApiKey(db: D1Database, id: number, lastUsedAt: string | null): Promise<void> {
  if (lastUsedAt && Date.now() - Date.parse(lastUsedAt) < 600_000) return;
  await db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
}
