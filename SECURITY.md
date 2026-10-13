# Security

Report vulnerabilities privately via GitHub security advisories on this repository, not public issues.

## Model

| Who | Can |
|---|---|
| Owner (API key, Access-authenticated dashboard user, OAuth-approved MCP client) | Everything |
| Share-link holder | Read and delete one inbox |
| Anyone who knows an address | Send it mail. Nothing else. |

- Keys and share tokens: 192 random bits, prefixed (`mm_key_`, `mm_in_`), stored as SHA-256 only. Failed auth is rate limited per client IP (`AUTH_RL`).
- `/admin` and `/authorize` require Cloudflare Access, verified in the Worker too (fails closed if `WEB_ACCESS_*` is unset). `DEV_BYPASS_ACCESS` only works for localhost hosts.
- Admin state changes require a same-origin request (`Origin` / `Sec-Fetch-Site`).
- Message HTML is served with `Content-Security-Policy: sandbox` (no `allow-scripts`, no same-origin), `default-src 'none'`, remote images blocked unless requested, and only frameable by our own pages. Attachments are forced downloads.
- Every response sets `Referrer-Policy: no-referrer` so share-link tokens don't leak through links in mail.
- Mail volume is capped per inbox, per day and per message size; over-cap mail is rejected at SMTP time.

## Not in scope

The instance owner can read all mail. Mail transits Cloudflare. Anyone can send mail to your domain; a share link is a bearer credential, so treat it like a password.
