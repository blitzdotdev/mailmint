import type { Env } from "../env.ts";

export interface Config {
  domains: string[];
  acceptUnknown: boolean;
  defaultTtlHours: number;
  autoTtlHours: number;
  maxTtlHours: number;
  maxAutoInboxesPerDay: number;
  maxMessagesPerInboxPerDay: number;
  maxMessagesPerDay: number;
  maxMessageBytes: number;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function config(env: Env): Config {
  const domains = (env.MAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) throw new Error("MAIL_DOMAINS is not configured");
  return {
    domains,
    acceptUnknown: env.ACCEPT_UNKNOWN !== "0",
    defaultTtlHours: int(env.DEFAULT_TTL_HOURS, 168),
    autoTtlHours: int(env.AUTO_TTL_HOURS, 24),
    maxTtlHours: int(env.MAX_TTL_HOURS, 720),
    maxAutoInboxesPerDay: int(env.MAX_AUTO_INBOXES_PER_DAY, 200),
    maxMessagesPerInboxPerDay: int(env.MAX_MESSAGES_PER_INBOX_PER_DAY, 300),
    maxMessagesPerDay: int(env.MAX_MESSAGES_PER_DAY, 5000),
    maxMessageBytes: int(env.MAX_MESSAGE_BYTES, 10 * 1024 * 1024),
  };
}
