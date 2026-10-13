import type { Env } from "./env.ts";
import { deleteInbox, expiredInboxes } from "./store/inboxes.ts";
import { pruneDailyCounters } from "./store/limits.ts";

const BATCH = 100;

/** Hourly: delete expired inboxes (R2 objects, rows, signal state) and old bookkeeping. */
export async function purge(env: Env): Promise<{ inboxes: number; failed: number }> {
  let inboxes = 0;
  let failed = 0;
  for (const inbox of await expiredInboxes(env.DB, BATCH)) {
    try {
      await deleteInbox(env, inbox);
      inboxes++;
    } catch (error) {
      failed++;
      console.error("purge: deleteInbox failed", { inbox: inbox.id, error: String(error) });
    }
  }
  await pruneDailyCounters(env.DB);
  await env.DB.prepare("DELETE FROM oauth_authorization_transactions WHERE expires_at <= ?")
    .bind(Math.floor(Date.now() / 1000))
    .run();
  console.log("purge done", { inboxes, failed });
  return { inboxes, failed };
}
