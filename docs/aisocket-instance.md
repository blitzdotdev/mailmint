# Hosted instance: mail.aisocket.dev

- **Account:** agent-socket Cloudflare account ("Blitz Development Sandbox").
- **Mail domain:** `aisocket.dev` (apex). The apex also serves the agent-socket relay alias through Worker custom domains (AAAA records). Email Routing uses only MX/TXT records, so the two coexist; confirmed 2026-10-13 (relay still 200 after routing was enabled).
- **Web host:** `https://mail.aisocket.dev` (Worker custom domain).
- **Worker:** `mailmint`. D1 `mailmint` (a8a8ec10-…), R2 `mailmint-raw`, KV `mailmint-oauth` (9c09d980…), DO `InboxSignal`.
- **Renamed 2026-10-13** from the working title burnermail: new Worker + fresh D1/R2/KV (the old ones held no data), token prefixes `mm_in_` / `mm_key_`, CLI config `~/.mailmint`, env `MAILMINT_*`.
- **Access application:** "mailmint admin", destinations `mail.aisocket.dev/admin` + `mail.aisocket.dev/authorize`, policies "Palash Self" + "blitz-developer" (same as mailroom), team `blitz-dev-box.cloudflareaccess.com`.
- **Deploy token:** account-owned `mailmint-deploy` in gitignored `.env`; permissions listed in docs/self-host.md step 2.

## Setup log (2026-10-13)

1. Email Routing → Onboard Domain → aisocket.dev → Activate. Added MX `route{1,2,3}.mx.cloudflare.net`, SPF `v=spf1 include:_spf.mx.cloudflare.net ~all`, DKIM `cf2024-1._domainkey`. No conflicting records.
2. Created the `mailmint-deploy` token and the Access application (via the dashboard API from a connected browser tab).
3. `wrangler d1 create mailmint`, `r2 bucket create mailmint-raw`, `kv namespace create mailmint-oauth` (recreated under the final name on 2026-10-13).
4. `bash scripts/deploy.sh deploy`. The first attempt used wrangler `addresses`; its account-level rules/plan call failed with the zone-scoped token, so the catch-all is set by `scripts/catch-all.sh` (zone API) instead: enabled, `*@aisocket.dev` → Worker `mailmint`.

## Operations

- Logs: `cd worker && npx wrangler tail`.
- Mail without an API key: `bash scripts/read-mail.sh [id]` (reads remote D1).
- Mint a key: `bash scripts/new-key.sh <name>`.
- End-to-end with real SMTP: `bash scripts/smoke-real-mail.sh` (see the script header).
