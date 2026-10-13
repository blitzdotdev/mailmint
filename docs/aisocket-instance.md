# Hosted instance: mail.aisocket.dev

- **Account:** agent-socket Cloudflare account ("Blitz Development Sandbox").
- **Mail domain:** `aisocket.dev` (apex). The apex also serves the agent-socket relay alias through Worker custom domains (AAAA records). Email Routing uses only MX/TXT records, so the two coexist; confirmed 2026-10-13 (relay still 200 after routing was enabled).
- **Web host:** `https://mail.aisocket.dev` (Worker custom domain).
- **Worker:** `burnermail`. D1 `burnermail` (2bedeaa4-…), R2 `burnermail-raw`, KV `burnermail-oauth`, DO `InboxSignal`.
- **Access application:** "burnermail admin", destinations `mail.aisocket.dev/admin` + `mail.aisocket.dev/authorize`, policies "Palash Self" + "blitz-developer" (same as mailroom), team `blitz-dev-box.cloudflareaccess.com`.
- **Deploy token:** account-owned `burnermail-deploy` in gitignored `.env`; permissions listed in docs/self-host.md step 2.

## Setup log (2026-10-13)

1. Email Routing → Onboard Domain → aisocket.dev → Activate. Added MX `route{1,2,3}.mx.cloudflare.net`, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, DKIM `cf2024-1._domainkey`. No conflicting records.
2. Created the `burnermail-deploy` token and the Access application (via the dashboard API from a connected browser tab).
3. `wrangler d1 create burnermail`, `r2 bucket create burnermail-raw`, `kv namespace create burnermail-oauth`.
4. `bash scripts/deploy.sh deploy`: the `addresses: ["*@aisocket.dev"]` entry creates the catch-all → Worker rule.

## Operations

- Logs: `cd worker && npx wrangler tail`.
- Mail without an API key: `bash scripts/read-mail.sh [id]` (reads remote D1).
- Mint a key: `bash scripts/new-key.sh <name>`.
- End-to-end with real SMTP: `bash scripts/smoke-real-mail.sh` (see the script header).
