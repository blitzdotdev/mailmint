# Runbook

| Symptom | Check |
|---|---|
| Mail never arrives | `npx wrangler tail` while sending. No `email` event → Email Routing: dashboard → Email Routing → the domain → Routing rules: the catch-all must be "Send to Worker → mailmint" (`bash scripts/catch-all.sh` re-applies it). Activity log shows drops/rejects with reasons. |
| Sender gets a bounce "over its daily limit" | `MAX_MESSAGES_PER_DAY` / `MAX_MESSAGES_PER_INBOX_PER_DAY` / `MAX_AUTO_INBOXES_PER_DAY` hit. See counters below. If it's spam to random addresses, set `ACCEPT_UNKNOWN` to `"0"` and deploy. |
| `wait` never returns early | Message stored but signal failed: look for `InboxSignal.signal failed` in logs. Waiters still see the mail on their next D1 check (at the latest when their timeout ends). |
| `/admin` shows "Sign-in required" | Access app destinations / `WEB_ACCESS_AUD` mismatch. The page shows the failure code. |
| MCP client can't connect | `/.well-known/oauth-authorization-server` must be 200; `/authorize` must be behind the same Access app as `/admin`. |

## Diagnostic SQL (`npx wrangler d1 execute DB --remote --command "…"`, from worker/)

```sql
-- today's counters
SELECT * FROM daily_counters WHERE day = date('now') ORDER BY count DESC LIMIT 20;
-- busiest inboxes
SELECT address, origin, message_count, last_message_at, expires_at FROM inboxes ORDER BY message_count DESC LIMIT 20;
-- expired but not yet purged
SELECT count(*) FROM inboxes WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ','now');
-- revoke every API key
UPDATE api_keys SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE revoked_at IS NULL;
```

## Emergency stop

Set `ACCEPT_UNKNOWN` to `"0"` (only created inboxes receive mail) and deploy. To stop all mail:
`bash scripts/catch-all.sh off` (mail to the domain is then dropped by Email Routing).
