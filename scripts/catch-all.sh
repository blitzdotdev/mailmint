#!/usr/bin/env bash
# Point the mail domain's Email Routing catch-all at the burnermail Worker (idempotent).
#   bash scripts/catch-all.sh            # enable: *@domain → Worker
#   bash scripts/catch-all.sh off        # disable the catch-all (mail to the domain is dropped)
#
# Uses the zone-level rules API (token permission: Zone → Email Routing Rules Write). Wrangler's
# config-managed `addresses` would do the same on deploy but needs account-level Email Routing
# permissions the deploy token doesn't have; see docs/self-host.md.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${CLOUDFLARE_API_TOKEN:?}"
DOMAIN="${MAIL_DOMAIN:-aisocket.dev}"
WORKER="${WORKER_NAME:-burnermail}"
api() { curl -sf -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" -H 'content-type: application/json' "$@"; }
zone=$(api "https://api.cloudflare.com/client/v4/zones?name=$DOMAIN" | node -e 'const j=JSON.parse(require("fs").readFileSync(0));const z=j.result?.[0];if(!z)process.exit(1);console.log(z.id)') \
  || { echo "zone $DOMAIN not visible to this token" >&2; exit 1; }
if [ "${1:-}" = "off" ]; then
  body='{"enabled":false,"matchers":[{"type":"all"}],"actions":[{"type":"drop"}]}'
else
  body="{\"enabled\":true,\"name\":\"burnermail catch-all\",\"matchers\":[{\"type\":\"all\"}],\"actions\":[{\"type\":\"worker\",\"value\":[\"$WORKER\"]}]}"
fi
api -X PUT "https://api.cloudflare.com/client/v4/zones/$zone/email/routing/rules/catch_all" --data "$body" |
  node -e 'const r=JSON.parse(require("fs").readFileSync(0)).result;console.log(`catch-all on ${process.argv[1]}: ${r.enabled?"enabled":"disabled"} → ${r.actions.map(a=>a.type+(a.value?":"+a.value.join(","):"")).join(", ")}`)' "$DOMAIN"
