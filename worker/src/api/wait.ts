import type { Env } from "../env.ts";
import { listMessages, type MessageRow } from "../store/messages.ts";

export interface WaitFilter {
  from?: string | null;
  subject?: string | null;
  tag?: string | null;
  /** Only messages where a code / link was confidently extracted. */
  extract?: "code" | "link" | null;
}

export const DEFAULT_WAIT_SECONDS = 25;
export const MAX_WAIT_SECONDS = 300;
const SCAN_BATCH = 50;

export function matches(m: MessageRow, f: WaitFilter): boolean {
  if (f.from) {
    const needle = f.from.toLowerCase();
    const hay = `${m.from_address ?? ""} ${m.from_name ?? ""} ${m.envelope_from}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  if (f.subject && !m.subject.toLowerCase().includes(f.subject.toLowerCase())) return false;
  if (f.tag && (m.tag ?? "") !== f.tag.toLowerCase()) return false;
  if (f.extract === "code" && !m.best_code) return false;
  if (f.extract === "link" && !m.best_link) return false;
  return true;
}

/**
 * First message in the inbox with id > since that matches the filter, waiting up
 * to timeoutMs for one to arrive. Returns the match (or null) and the cursor to
 * pass as `since` next time.
 */
export async function waitForMessage(
  env: Env,
  inbox: { id: number; address: string },
  since: number,
  filter: WaitFilter,
  timeoutMs: number,
): Promise<{ message: MessageRow | null; cursor: number }> {
  const deadline = Date.now() + timeoutMs;
  const signal = env.SIGNAL.get(env.SIGNAL.idFromName(inbox.address));
  let cursor = since;
  let signalled = 0;
  for (;;) {
    const batch = await listMessages(env.DB, inbox.id, { since: cursor, limit: SCAN_BATCH, order: "asc" });
    for (const m of batch) {
      if (matches(m, filter)) return { message: m, cursor: m.id };
      cursor = m.id;
    }
    if (batch.length === SCAN_BATCH) continue;
    const remaining = deadline - Date.now();
    if (remaining <= 0) return { message: null, cursor };
    // The signal says something newer than `cursor` exists but D1 showed nothing:
    // back off briefly instead of spinning on an immediately-resolving wait.
    if (batch.length === 0 && signalled > cursor) await new Promise((r) => setTimeout(r, 200));
    signalled = await signal.wait(cursor, remaining);
  }
}
