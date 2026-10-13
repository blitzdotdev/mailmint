/** Increment a per-UTC-day counter and return the new value (atomic upsert). */
export async function bumpDailyCounter(db: D1Database, key: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const row = await db
    .prepare(
      `INSERT INTO daily_counters (day, key, count) VALUES (?, ?, 1)
       ON CONFLICT (day, key) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(day, key)
    .first<{ count: number }>();
  return row?.count ?? 1;
}

export async function pruneDailyCounters(db: D1Database, keepDays = 7): Promise<void> {
  const cutoff = new Date(Date.now() - keepDays * 86400_000).toISOString().slice(0, 10);
  await db.prepare("DELETE FROM daily_counters WHERE day < ?").bind(cutoff).run();
}
