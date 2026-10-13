import type { Context } from "hono";
import type { Env } from "../env.ts";
import { ApiError } from "../lib/errors.ts";
import { API_KEY_PREFIX, INBOX_TOKEN_PREFIX, looksLikeToken, sha256Hex } from "../lib/tokens.ts";
import { findActiveApiKey, touchApiKey } from "../store/api-keys.ts";
import { getInboxByTokenHash, isExpired, type InboxRow } from "../store/inboxes.ts";

// Works for any sub-app whose Bindings are Env, whatever its Variables.
type AnyCtx = Context<{ Bindings: Env; Variables: any }>;

/** Who is calling: the owner (API key) or one inbox (its capability token). */
export type Principal =
  | { kind: "owner"; name: string }
  | { kind: "inbox"; inbox: InboxRow };

export async function principalFromBearer(c: AnyCtx): Promise<Principal> {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    throw new ApiError(401, "unauthorized", "Send `Authorization: Bearer <api key or inbox token>`");
  }
  return principalFromToken(c, token);
}

export async function principalFromToken(c: AnyCtx, token: string): Promise<Principal> {
  if (looksLikeToken(token)) {
    if (token.startsWith(API_KEY_PREFIX)) {
      const key = await findActiveApiKey(c.env.DB, token);
      if (key) {
        c.executionCtx.waitUntil(touchApiKey(c.env.DB, key.id, key.last_used_at).catch(() => {}));
        return { kind: "owner", name: key.name };
      }
    } else if (token.startsWith(INBOX_TOKEN_PREFIX)) {
      const inbox = await getInboxByTokenHash(c.env.DB, await sha256Hex(token));
      if (inbox && !isExpired(inbox)) return { kind: "inbox", inbox };
    }
  }
  await limitFailedAuth(c);
  throw new ApiError(401, "unauthorized", "Invalid, revoked or expired token");
}

async function limitFailedAuth(c: AnyCtx): Promise<void> {
  if (!c.env.AUTH_RL) return;
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const { success } = await c.env.AUTH_RL.limit({ key: `auth:${ip}` });
  if (!success) throw new ApiError(429, "rate_limited", "Too many failed authentication attempts");
}

export function requireOwner(p: Principal): void {
  if (p.kind !== "owner") throw new ApiError(403, "forbidden", "This needs an owner API key, not an inbox token");
}

/** An inbox token may only touch its own inbox. */
export function assertInboxAccess(p: Principal, inbox: Pick<InboxRow, "id">): void {
  if (p.kind === "inbox" && p.inbox.id !== inbox.id) {
    throw new ApiError(404, "not_found", "Inbox not found");
  }
}
