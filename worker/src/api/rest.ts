import { Hono, type Context } from "hono";
import type { Env } from "../env.ts";
import { ApiError } from "../lib/errors.ts";
import { deleteInbox, listInboxes, type InboxRow } from "../store/inboxes.ts";
import { latestMessageId, listMessages } from "../store/messages.ts";
import { principalFromBearer, principalFromToken, requireOwner, type Principal } from "./auth.ts";
import {
  createInbox,
  findInbox,
  findMessage,
  messageAttachment,
  messageHtml,
  updateInboxSettings,
} from "./ops.ts";
import { presentInbox, presentMessage, presentMessageSummary, type MessageBase } from "./present.ts";
import { DEFAULT_WAIT_SECONDS, MAX_WAIT_SECONDS, waitForMessage, type WaitFilter } from "./wait.ts";

type Vars = { principal: Principal };
type C = Context<{ Bindings: Env; Variables: Vars }>;

const MAX_JSON_BYTES = 8 * 1024;

// ---------- request parsing ----------

export async function jsonBody(c: Context, allowed: readonly string[]): Promise<Record<string, unknown>> {
  const length = Number(c.req.header("Content-Length") ?? "0");
  if (length > MAX_JSON_BYTES) throw new ApiError(413, "payload_too_large", "Body too large");
  const text = await c.req.text();
  if (text.length > MAX_JSON_BYTES) throw new ApiError(413, "payload_too_large", "Body too large");
  if (!text.trim()) return {};
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_request", "Body must be JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ApiError(400, "invalid_request", "Body must be a JSON object");
  }
  for (const key of Object.keys(body)) {
    if (!allowed.includes(key)) {
      throw new ApiError(400, "unknown_field", `Unknown field "${key}". Allowed: ${allowed.join(", ")}`);
    }
  }
  return body as Record<string, unknown>;
}

function query(c: Context, allowed: readonly string[]): Record<string, string> {
  const params = c.req.query();
  for (const key of Object.keys(params)) {
    if (!allowed.includes(key)) {
      throw new ApiError(400, "unknown_field", `Unknown query parameter "${key}". Allowed: ${allowed.join(", ") || "none"}`);
    }
  }
  return params;
}

function intParam(value: string | undefined, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new ApiError(400, "invalid_request", `${name} must be an integer >= ${min}`);
  return Math.min(n, max);
}

function optString(body: Record<string, unknown>, key: string): string | null | undefined {
  const v = body[key];
  if (v === undefined || v === null) return v as null | undefined;
  if (typeof v !== "string") throw new ApiError(400, "invalid_request", `${key} must be a string`);
  return v;
}

function optNumber(body: Record<string, unknown>, key: string): number | null | undefined {
  const v = body[key];
  if (v === undefined || v === null) return v as null | undefined;
  if (typeof v !== "number") throw new ApiError(400, "invalid_request", `${key} must be a number`);
  return v;
}

// ---------- shared handlers (used by /v1 and /i/:token) ----------

async function listMessagesResponse(c: C, inbox: InboxRow, base: MessageBase) {
  const q = query(c, ["since", "limit", "order"]);
  const since = intParam(q.since, "since", 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = intParam(q.limit, "limit", 20, 1, 100);
  const order = q.order === "asc" ? "asc" : q.order === undefined || q.order === "desc" ? "desc" : null;
  if (!order) throw new ApiError(400, "invalid_request", "order must be asc or desc");
  const rows = await listMessages(c.env.DB, inbox.id, { since, limit, order });
  return c.json({
    inbox: inbox.address,
    messages: rows.map((m) => presentMessageSummary(m, inbox.address, base)),
    cursor: Math.max(since, ...rows.map((m) => m.id)),
  });
}

async function waitResponse(c: C, inbox: InboxRow, base: MessageBase) {
  const q = query(c, ["since", "timeout", "from", "subject", "tag", "extract"]);
  const since =
    q.since === "latest" ? await latestMessageId(c.env.DB, inbox.id) : intParam(q.since, "since", 0, 0, Number.MAX_SAFE_INTEGER);
  const timeout = intParam(q.timeout, "timeout", DEFAULT_WAIT_SECONDS, 0, MAX_WAIT_SECONDS);
  if (q.extract !== undefined && q.extract !== "code" && q.extract !== "link") {
    throw new ApiError(400, "invalid_request", "extract must be code or link");
  }
  const filter: WaitFilter = {
    from: q.from || null,
    subject: q.subject || null,
    tag: q.tag || null,
    extract: (q.extract as WaitFilter["extract"]) ?? null,
  };
  const { message, cursor } = await waitForMessage(c.env, inbox, since, filter, timeout * 1000);
  return c.json({
    inbox: inbox.address,
    message: message ? presentMessage(message, inbox.address, base) : null,
    timed_out: message === null,
    cursor,
  });
}

async function messageResponse(c: C, id: number, base: MessageBase, inboxOf: (inboxId: number) => Promise<string>) {
  const m = await findMessage(c.env, c.get("principal"), id);
  return c.json(presentMessage(m, await inboxOf(m.inbox_id), base));
}

async function rawResponse(c: C, id: number) {
  const m = await findMessage(c.env, c.get("principal"), id);
  const object = await c.env.RAW.get(m.raw_key);
  if (!object) throw new ApiError(404, "not_found", "Raw message is gone");
  return new Response(object.body, {
    headers: { "Content-Type": "message/rfc822", "Content-Disposition": `attachment; filename="message-${m.id}.eml"` },
  });
}

export async function htmlResponse(_c: Context, html: string | null, allowImages: boolean): Promise<Response> {
  const body = html ?? "<p style=\"font-family:system-ui;color:#71717a\">This message has no HTML part.</p>";
  // Links open in a new tab; scripts never run (CSP sandbox without allow-scripts).
  const doc = `<!doctype html><meta charset="utf-8"><base target="_blank">${body}`;
  return new Response(doc, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": [
        "sandbox allow-popups allow-popups-to-escape-sandbox",
        "default-src 'none'",
        "style-src 'unsafe-inline'",
        "font-src data:",
        allowImages ? "img-src data: https: http:" : "img-src data:",
        "frame-ancestors 'self'",
      ].join("; "),
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}

async function attachmentResponse(c: C, id: number, index: number) {
  const m = await findMessage(c.env, c.get("principal"), id);
  const { meta, body } = await messageAttachment(c.env, m, index);
  const filename = (meta.filename ?? `attachment-${index}`).replace(/["\\\r\n]/g, "_");
  return new Response(body, {
    headers: {
      // Never render attachments inline on our origin.
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Original-Content-Type": meta.content_type,
    },
  });
}

function messageId(c: Context): number {
  return intParam(c.req.param("id"), "id", 0, 1, Number.MAX_SAFE_INTEGER);
}

function inboxAddressLookup(c: C) {
  return async (inboxId: number) => {
    const row = await c.env.DB.prepare("SELECT address FROM inboxes WHERE id = ?").bind(inboxId).first<{ address: string }>();
    return row?.address ?? "";
  };
}

// ---------- /v1 (Bearer: owner API key or inbox token) ----------

export const v1 = new Hono<{ Bindings: Env; Variables: Vars }>();

v1.use("*", async (c, next) => {
  c.set("principal", await principalFromBearer(c));
  await next();
});

const v1Base: MessageBase = (id) => `/v1/messages/${id}`;

v1.get("/me", (c) => {
  const p = c.get("principal");
  return c.json(p.kind === "owner" ? { kind: "owner", key: p.name } : { kind: "inbox", inbox: p.inbox.address });
});

v1.post("/inboxes", async (c) => {
  requireOwner(c.get("principal"));
  const body = await jsonBody(c, ["local", "address", "domain", "ttl_hours", "label"]);
  const local = optString(body, "local") ?? optString(body, "address");
  const created = await createInbox(c.env, new URL(c.req.url).origin, {
    local,
    domain: optString(body, "domain"),
    ttl_hours: optNumber(body, "ttl_hours"),
    label: optString(body, "label"),
  });
  return c.json(presentInbox(created.inbox, { token: created.token, url: created.url }), 201);
});

v1.get("/inboxes", async (c) => {
  const p = c.get("principal");
  const q = query(c, ["limit", "q"]);
  if (p.kind === "inbox") return c.json({ inboxes: [presentInbox(p.inbox)] });
  const rows = await listInboxes(c.env.DB, { limit: intParam(q.limit, "limit", 50, 1, 200), query: q.q });
  return c.json({ inboxes: rows.map((r) => presentInbox(r)) });
});

v1.get("/inboxes/:address", async (c) => {
  query(c, []);
  return c.json(presentInbox(await findInbox(c.env, c.get("principal"), c.req.param("address"))));
});

v1.patch("/inboxes/:address", async (c) => {
  requireOwner(c.get("principal"));
  const inbox = await findInbox(c.env, c.get("principal"), c.req.param("address"));
  const body = await jsonBody(c, ["ttl_hours", "label"]);
  const ttl = optNumber(body, "ttl_hours");
  const label = optString(body, "label");
  return c.json(
    presentInbox(
      await updateInboxSettings(c.env, inbox, {
        ...(ttl !== undefined ? { ttl_hours: ttl } : {}),
        ...(label !== undefined ? { label } : {}),
      }),
    ),
  );
});

v1.delete("/inboxes/:address", async (c) => {
  const inbox = await findInbox(c.env, c.get("principal"), c.req.param("address"));
  await deleteInbox(c.env, inbox);
  return c.json({ deleted: inbox.address });
});

v1.get("/inboxes/:address/messages", async (c) =>
  listMessagesResponse(c, await findInbox(c.env, c.get("principal"), c.req.param("address")), v1Base));

v1.get("/inboxes/:address/wait", async (c) =>
  waitResponse(c, await findInbox(c.env, c.get("principal"), c.req.param("address")), v1Base));

v1.get("/messages/:id", async (c) => messageResponse(c, messageId(c), v1Base, inboxAddressLookup(c)));
v1.get("/messages/:id/raw", async (c) => rawResponse(c, messageId(c)));
v1.get("/messages/:id/html", async (c) => {
  const q = query(c, ["images"]);
  const m = await findMessage(c.env, c.get("principal"), messageId(c));
  return htmlResponse(c, await messageHtml(c.env, m), q.images === "1");
});
v1.get("/messages/:id/attachments/:n", async (c) =>
  attachmentResponse(c, messageId(c), intParam(c.req.param("n"), "n", 0, 0, 100)));

// ---------- /i/:token (capability link: the URL is the key to one inbox) ----------

export const capability = new Hono<{ Bindings: Env; Variables: Vars }>();

capability.use("*", async (c, next) => {
  const p = await principalFromToken(c, c.req.param("token") ?? "");
  if (p.kind !== "inbox") throw new ApiError(404, "not_found", "Not found");
  c.set("principal", p);
  await next();
});

function capBase(c: C): MessageBase {
  const token = c.req.param("token");
  return (id) => `/i/${token}/messages/${id}`;
}

function capInbox(c: C): InboxRow {
  const p = c.get("principal");
  if (p.kind !== "inbox") throw new ApiError(404, "not_found", "Not found");
  return p.inbox;
}

capability.get("/inbox", (c) => c.json(presentInbox(capInbox(c))));
capability.delete("/", async (c) => {
  const inbox = capInbox(c);
  await deleteInbox(c.env, inbox);
  return c.json({ deleted: inbox.address });
});
capability.get("/messages", async (c) => listMessagesResponse(c, capInbox(c), capBase(c)));
capability.get("/wait", async (c) => waitResponse(c, capInbox(c), capBase(c)));
capability.get("/messages/:id", async (c) => messageResponse(c, messageId(c), capBase(c), async () => capInbox(c).address));
capability.get("/messages/:id/raw", async (c) => rawResponse(c, messageId(c)));
capability.get("/messages/:id/html", async (c) => {
  const q = query(c, ["images"]);
  const m = await findMessage(c.env, c.get("principal"), messageId(c));
  return htmlResponse(c, await messageHtml(c.env, m), q.images === "1");
});
capability.get("/messages/:id/attachments/:n", async (c) =>
  attachmentResponse(c, messageId(c), intParam(c.req.param("n"), "n", 0, 0, 100)));
