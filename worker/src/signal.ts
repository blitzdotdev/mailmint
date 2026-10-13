import { DurableObject } from "cloudflare:workers";

interface Waiter {
  since: number;
  resolve: (lastId: number) => void;
}

/**
 * One per inbox row (see lib/signal-stub.ts). It stores no mail, only the
 * highest message id stored for the inbox, so long-polling `wait` requests
 * wake the moment `email()` commits a message instead of polling D1.
 *
 * No lost wakeups: `email()` inserts into D1 *then* calls `signal(id)`, and a
 * waiter checks D1 *then* calls `wait(since)`. If the signal landed in between,
 * the persisted high-water mark is already > since and `wait` returns at once.
 */
export class InboxSignal extends DurableObject {
  private lastId: number | null = null;
  private readonly waiters = new Set<Waiter>();

  private async load(): Promise<number> {
    if (this.lastId === null) this.lastId = (await this.ctx.storage.get<number>("last")) ?? 0;
    return this.lastId;
  }

  async signal(id: number): Promise<void> {
    const current = await this.load();
    if (id > current) {
      this.lastId = id;
      await this.ctx.storage.put("last", id);
    }
    const last = this.lastId ?? 0;
    for (const waiter of [...this.waiters]) {
      if (last > waiter.since) waiter.resolve(last);
    }
  }

  /** Resolves with the new high-water mark once it exceeds `since`, or 0 on timeout. */
  async wait(since: number, timeoutMs: number): Promise<number> {
    const current = await this.load();
    if (current > since) return current;
    return new Promise<number>((resolve) => {
      const waiter: Waiter = {
        since,
        resolve: (lastId) => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve(lastId);
        },
      };
      const timer = setTimeout(() => waiter.resolve(0), Math.max(0, timeoutMs));
      this.waiters.add(waiter);
    });
  }

  /** Called when the inbox is deleted. */
  async reset(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.lastId = 0;
  }
}

