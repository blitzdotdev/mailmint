# Manage the catch-all with wrangler `addresses` instead of scripts/catch-all.sh

## Why this matters
Config-as-code routing (`"addresses": ["*@aisocket.dev"]`) is cleaner than an API script. `wrangler deploy` calls
`/accounts/:id/email/routing/rules/plan`, which returned `Authentication error [10000]` for the zone-scoped
`burnermail-deploy` token (2026-10-13), so the catch-all is set through the zone API instead.

## What to change
Add the account-level Email Routing permission the plan endpoint needs to the deploy token (dashboard → API tokens),
put `addresses` back in `worker/wrangler.jsonc`, and drop the `catch-all.sh` call from `scripts/deploy.sh`.

## Acceptance
`bash scripts/deploy.sh deploy` exits 0 and the catch-all still points at the Worker.
