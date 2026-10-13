#!/usr/bin/env bash
# burnermail deploy helper.
#   bash scripts/deploy.sh deploy   # check + unit tests + remote D1 migrations + wrangler deploy + catch-all + smoke
#   bash scripts/deploy.sh smoke    # HTTP smoke test of the live instance
#   bash scripts/deploy.sh dev      # local wrangler dev on 0.0.0.0:8787
# Needs .env (gitignored) with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
# Fresh hostname not resolving locally yet? SMOKE_RESOLVE=mail.example.com:443:<ip> pins it for curl.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
BASE_URL="${BURNERMAIL_URL:-https://mail.aisocket.dev}"

need() { [ -n "${!1:-}" ] || { echo "missing $1 (put it in .env)" >&2; exit 1; }; }

smoke() {
  local fail=0
  check() { # method path expected-status
    local got
    got=$(curl -s -o /dev/null -w '%{http_code}' ${SMOKE_RESOLVE:+--resolve "$SMOKE_RESOLVE"} -X "$1" "$BASE_URL$2" || true)
    if [ "$got" = "$3" ]; then echo "  ok   $1 $2 → $got"; else echo "  FAIL $1 $2 → $got (want $3)"; fail=1; fi
  }
  echo "smoke: $BASE_URL"
  check GET /healthz 200
  check GET /agents.md 200
  check GET /skill.md 200
  check GET /v1/inboxes 401
  check GET /i/bm_in_00000000000000000000000000000000/messages 401
  check POST /mcp 401
  check GET /.well-known/oauth-authorization-server 200
  # Access sits in front of /admin: unauthenticated requests are redirected to the login.
  check GET /admin 302
  return $fail
}

case "${1:-}" in
  deploy)
    need CLOUDFLARE_API_TOKEN; need CLOUDFLARE_ACCOUNT_ID
    npm run check -w worker
    npm test -w worker
    (cd worker && npx wrangler d1 migrations apply DB --remote)
    (cd worker && npx wrangler deploy)
    bash scripts/catch-all.sh
    smoke
    ;;
  smoke) smoke ;;
  # --local-upstream keeps request URLs on localhost (the dev Access bypass and share links depend on it).
  dev) (cd worker && npx wrangler dev --ip 0.0.0.0 --port 8787 --local-upstream localhost:8787 --test-scheduled) ;;
  *) sed -n '2,8p' "$0"; exit 1 ;;
esac
