import type { Env } from "../env.ts";

/**
 * The InboxSignal for one inbox row. Keyed by id, not address: an address can be
 * deleted and recreated, and a waiter holding the old row must not be woken by
 * (and spin on) mail stored under the new one.
 */
export function signalStub(env: Pick<Env, "SIGNAL">, inboxId: number) {
  return env.SIGNAL.get(env.SIGNAL.idFromName(`inbox:${inboxId}`));
}
