import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { InboxSignal } from "./signal.ts";

export interface Env {
  DB: D1Database;
  RAW: R2Bucket;
  OAUTH_KV: KVNamespace;
  SIGNAL: DurableObjectNamespace<InboxSignal>;
  AUTH_RL?: RateLimit;

  MAIL_DOMAINS: string;
  ACCEPT_UNKNOWN?: string;
  DEFAULT_TTL_HOURS?: string;
  AUTO_TTL_HOURS?: string;
  MAX_TTL_HOURS?: string;
  MAX_AUTO_INBOXES_PER_DAY?: string;
  MAX_MESSAGES_PER_INBOX_PER_DAY?: string;
  MAX_MESSAGES_PER_DAY?: string;
  MAX_MESSAGE_BYTES?: string;

  WEB_ACCESS_TEAM_DOMAIN?: string;
  WEB_ACCESS_AUD?: string;
  /** Local dev only (.dev.vars). Honoured only for localhost hosts. */
  DEV_BYPASS_ACCESS?: string;
}

/** Env as seen inside OAuthProvider-wrapped handlers. */
export interface WorkerEnv extends Env {
  OAUTH_PROVIDER: OAuthHelpers;
}
