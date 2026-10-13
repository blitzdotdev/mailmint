# Self-hosting burnermail

## Requirements

- A domain on Cloudflare **used only for this.** Catch-all routing works on apex domains only, and Email Routing refuses domains whose MX records point elsewhere. A cheap new domain is ideal; it also keeps disposable-mail reputation away from your real domains.
- Workers (the free plan works for receiving; Durable Objects use the SQLite backend). R2 enabled.
- Node 22+, a Cloudflare API token (below).

## 1. Enable Email Routing on the domain

Dashboard → Compute → Email Service → Email Routing → Onboard Domain → pick the domain → Activate.
This adds 3 MX records, SPF and DKIM. Don't create routing rules; the deploy points the catch-all at the Worker (`scripts/catch-all.sh`).

## 2. API token

Create an account API token with:

| Scope | Permissions |
|---|---|
| Account | Account Settings Read, Workers Scripts Write, D1 Write, Workers R2 Storage Write, Workers KV Storage Write, Workers Tail Read |
| Zone (your mail domain) | Zone Read, DNS Write, Workers Routes Write, Email Routing Rules Write |

Put it in `.env` at the repo root (gitignored):

```sh
CLOUDFLARE_ACCOUNT_ID=…
CLOUDFLARE_API_TOKEN=…
```

## 3. Resources

```sh
npm install
set -a; . ./.env; set +a
cd worker
npx wrangler d1 create burnermail            # → database_id
npx wrangler r2 bucket create burnermail-raw
npx wrangler kv namespace create burnermail-oauth   # → id
```

## 4. Cloudflare Access for the owner pages

Zero Trust → Access → Applications → Add → Self-hosted. Destinations: `<host>/admin` and `<host>/authorize`
(two paths, one application). Add a policy allowing your email. Copy the **Application Audience (AUD)** and your team
domain (`https://<team>.cloudflareaccess.com`).

Everything else stays public at the edge and is authenticated by the Worker (API keys, share links, OAuth).

## 5. Configure `worker/wrangler.jsonc`

- `routes[0].pattern`: the web host, e.g. `mail.example.com` (a subdomain is fine for the website).
- Set `MAIL_DOMAIN=example.com` in `.env` so `scripts/catch-all.sh` (run by the deploy) targets your domain.
- `vars.MAIL_DOMAINS`: `example.com` (comma-separate several; run `MAIL_DOMAIN=<each> bash scripts/catch-all.sh` for each).
- `vars.WEB_ACCESS_TEAM_DOMAIN`, `vars.WEB_ACCESS_AUD`: from step 4.
- `d1_databases[0].database_id`, `kv_namespaces[0].id`: from step 3.
- `ratelimits[0].namespace_id`: any integer unique within your account.
- Optional: `ACCEPT_UNKNOWN`, the TTLs and the caps (commented in the file).

## 6. Deploy

```sh
bash scripts/deploy.sh deploy     # check, tests, D1 migrations, wrangler deploy, catch-all → Worker, smoke test
bash scripts/new-key.sh laptop    # mint an API key without the browser (or use /admin/keys)
npx burnermail login --url https://mail.example.com --key <key>
```

Send a real email to `anything@example.com` and run `npx burnermail ls`.

## Updating

`git pull && bash scripts/deploy.sh deploy`. Migrations in `worker/migrations/` apply in order.

## Config-managed routing (optional)

Wrangler 4.113+ can own the catch-all from config: add `"addresses": ["*@example.com"]` to `wrangler.jsonc`
and drop the `catch-all.sh` call from `scripts/deploy.sh`. The token then also needs the **account-level**
Email Routing permissions (Wrangler plans the change through `/accounts/:id/email/routing/rules/plan`); with
only the zone permission above, `wrangler deploy` uploads the Worker and then fails with "Authentication error".
