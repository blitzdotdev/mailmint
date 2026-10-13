// Operations shared by every surface (REST, capability links, admin UI, MCP).
// Surfaces do auth + I/O shaping; the rules live here.

import PostalMime from "postal-mime";
import type { Env } from "../env.ts";
import { isValidLocal, parseAddress, randomLocal } from "../lib/address.ts";
import { config } from "../lib/config.ts";
import { ApiError } from "../lib/errors.ts";
import { newInboxToken, sha256Hex } from "../lib/tokens.ts";
import {
  claimInbox,
  getInboxByAddress,
  insertInbox,
  isoAfterHours,
  setInboxToken,
  updateInbox,
  type InboxRow,
} from "../store/inboxes.ts";
import { getMessage, parseJson, type MessageRow, type StoredAttachment } from "../store/messages.ts";
import type { Principal } from "./auth.ts";
import { assertInboxAccess } from "./auth.ts";

export interface CreateInboxInput {
  /** Local part (`name` in name@domain), or a full address on an allowed domain. Random if omitted. */
  local?: string | null;
  domain?: string | null;
  ttl_hours?: number | null;
  label?: string | null;
}

export interface CreatedInbox {
  inbox: InboxRow;
  token: string;
  /** Capability URL: anyone holding it can read this one inbox. */
  url: string;
}

export function capabilityUrl(origin: string, token: string): string {
  return `${origin}/i/${token}`;
}

function ttlHours(env: Env, requested: number | null | undefined): number {
  const cfg = config(env);
  if (requested === null || requested === undefined) return cfg.defaultTtlHours;
  if (!Number.isFinite(requested) || requested <= 0) {
    throw new ApiError(400, "invalid_request", "ttl_hours must be a positive number");
  }
  return Math.min(requested, cfg.maxTtlHours);
}

function cleanLabel(label: string | null | undefined): string | null {
  const value = label?.trim();
  if (!value) return null;
  if (value.length > 120) throw new ApiError(400, "invalid_request", "label is limited to 120 characters");
  return value;
}

export async function createInbox(env: Env, origin: string, input: CreateInboxInput): Promise<CreatedInbox> {
  const cfg = config(env);
  const label = cleanLabel(input.label);
  const expiresAt = isoAfterHours(ttlHours(env, input.ttl_hours));

  let domain = (input.domain ?? cfg.domains[0] ?? "").trim().toLowerCase();
  let local = input.local?.trim().toLowerCase() || null;
  if (local?.includes("@")) {
    const parsed = parseAddress(local);
    if (!parsed || parsed.tag) throw new ApiError(400, "invalid_address", "Not a valid address");
    local = parsed.local;
    domain = parsed.domain;
  }
  if (!cfg.domains.includes(domain)) {
    throw new ApiError(400, "domain_not_allowed", `Domain must be one of: ${cfg.domains.join(", ")}`);
  }
  if (local !== null && !isValidLocal(local)) {
    throw new ApiError(
      400,
      "invalid_address",
      "Local part must be 1-64 chars of a-z, 0-9, '.', '_' or '-', starting and ending with a letter or digit",
    );
  }

  const token = newInboxToken();
  const tokenHash = await sha256Hex(token);

  if (local !== null) {
    const address = `${local}@${domain}`;
    const inserted = await insertInbox(env.DB, { address, tokenHash, origin: "api", label, expiresAt });
    if (inserted) return { inbox: inserted, token, url: capabilityUrl(origin, token) };
    // Exists. A catch-all inbox nobody has claimed yet can be claimed (keeps its mail).
    const existing = await getInboxByAddress(env.DB, address);
    if (existing && existing.token_hash === null) {
      const claimed = await claimInbox(env.DB, existing.id, { tokenHash, label, expiresAt });
      if (claimed) return { inbox: claimed, token, url: capabilityUrl(origin, token) };
    }
    throw new ApiError(409, "address_taken", `${address} already exists`);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const address = `${randomLocal()}@${domain}`;
    const inserted = await insertInbox(env.DB, { address, tokenHash, origin: "api", label, expiresAt });
    if (inserted) return { inbox: inserted, token, url: capabilityUrl(origin, token) };
  }
  throw new ApiError(500, "internal", "Could not allocate a random address");
}

/** Look up an inbox the principal may see. Accepts `name@domain` or bare `name` (default domain). */
export async function findInbox(env: Env, principal: Principal, addressOrLocal: string): Promise<InboxRow> {
  const cfg = config(env);
  // Route params arrive already percent-decoded.
  const value = addressOrLocal.trim().toLowerCase();
  const parsed = parseAddress(value.includes("@") ? value : `${value}@${cfg.domains[0]}`);
  const inbox = parsed ? await getInboxByAddress(env.DB, parsed.address) : null;
  if (!inbox) throw new ApiError(404, "not_found", "Inbox not found");
  assertInboxAccess(principal, inbox);
  return inbox;
}

export async function updateInboxSettings(
  env: Env,
  inbox: InboxRow,
  input: { ttl_hours?: number | null; label?: string | null },
): Promise<InboxRow> {
  const updated = await updateInbox(env.DB, inbox.id, {
    ...(input.label !== undefined ? { label: cleanLabel(input.label) } : {}),
    ...(input.ttl_hours !== undefined && input.ttl_hours !== null
      ? { expiresAt: isoAfterHours(ttlHours(env, input.ttl_hours)) }
      : {}),
  });
  if (!updated) throw new ApiError(404, "not_found", "Inbox not found");
  return updated;
}

export async function findMessage(env: Env, principal: Principal, id: number): Promise<MessageRow> {
  const message = Number.isSafeInteger(id) && id > 0 ? await getMessage(env.DB, id) : null;
  if (!message) throw new ApiError(404, "not_found", "Message not found");
  if (principal.kind === "inbox" && principal.inbox.id !== message.inbox_id) {
    throw new ApiError(404, "not_found", "Message not found");
  }
  return message;
}

/** The message's HTML, from D1, or re-parsed from the raw .eml when it was too big to keep. */
export async function messageHtml(env: Env, message: MessageRow): Promise<string | null> {
  if (message.html_body !== null) return message.html_body;
  if (message.html_truncated !== 1) return null;
  const raw = await env.RAW.get(message.raw_key);
  if (!raw) return null;
  const parsed = await PostalMime.parse(await raw.arrayBuffer());
  return parsed.html ?? null;
}

export async function messageAttachment(
  env: Env,
  message: MessageRow,
  index: number,
): Promise<{ meta: StoredAttachment; body: ReadableStream }> {
  const meta = parseJson<StoredAttachment[]>(message.attachments_json, [])[index];
  if (!meta) throw new ApiError(404, "not_found", "Attachment not found");
  const object = await env.RAW.get(meta.key);
  if (!object) throw new ApiError(404, "not_found", "Attachment content is gone");
  return { meta, body: object.body };
}

/** New capability link for an existing inbox; the previous link stops working. */
export async function issueInboxLink(env: Env, origin: string, inbox: InboxRow): Promise<CreatedInbox> {
  const token = newInboxToken();
  const updated = await setInboxToken(env.DB, inbox.id, {
    tokenHash: await sha256Hex(token),
    autoExpiresAt: isoAfterHours(config(env).defaultTtlHours),
  });
  if (!updated) throw new ApiError(404, "not_found", "Inbox not found");
  return { inbox: updated, token, url: capabilityUrl(origin, token) };
}
