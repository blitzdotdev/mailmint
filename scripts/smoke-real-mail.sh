#!/usr/bin/env bash
# End-to-end over real SMTP: send a verification-style email from agentsocket.dev (Cloudflare Email
# Sending, via the test-only smoke-sender Worker) to a fresh inbox on the live instance, and check that
# `wait --code` returns the code. Exercises MX → Email Routing catch-all → email() → D1/R2 → DO wake.
#
#   bash scripts/smoke-real-mail.sh setup   # deploy smoke-sender + set its secret (once)
#   bash scripts/smoke-real-mail.sh         # run the test (needs MAILMINT_KEY or a CLI login)
#
# .env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, SMOKE_SENDER_URL, SMOKE_SECRET (setup writes the last two).
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
CLI="node cli/bin/mailmint.mjs"

if [ "${1:-}" = "setup" ]; then
  secret="${SMOKE_SECRET:-$(node -e 'console.log(require("crypto").randomBytes(24).toString("base64url"))')}"
  out=$(cd scripts/smoke-sender && npx --prefix ../../worker wrangler deploy 2>&1) || { echo "$out"; exit 1; }
  url=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' <<<"$out" | head -1)
  (cd scripts/smoke-sender && printf '%s' "$secret" | npx --prefix ../../worker wrangler secret put SMOKE_SECRET >/dev/null)
  grep -q '^SMOKE_SECRET=' .env || printf 'SMOKE_SECRET=%s\n' "$secret" >> .env
  grep -q '^SMOKE_SENDER_URL=' .env || printf 'SMOKE_SENDER_URL=%s\n' "$url" >> .env
  echo "smoke-sender deployed at $url (secret saved to .env)"
  exit 0
fi

: "${SMOKE_SENDER_URL:?run: bash scripts/smoke-real-mail.sh setup}"
: "${SMOKE_SECRET:?run: bash scripts/smoke-real-mail.sh setup}"
export MAILMINT_URL="${MAILMINT_URL:-https://mail.aisocket.dev}"

addr=$($CLI new --label "smoke-real-mail $(date -u +%FT%TZ)" --ttl 1h)
code=$(node -e 'console.log(String(100000 + require("crypto").randomInt(900000)))')
echo "inbox: $addr   expecting code: $code"
started=$(date +%s)
curl -sf -X POST "$SMOKE_SENDER_URL" -H "x-smoke-secret: $SMOKE_SECRET" -H 'content-type: application/json' \
  -d "{\"to\":\"$addr\",\"subject\":\"Your verification code\",\"text\":\"Your verification code is $code. It expires in 10 minutes.\",\"html\":\"<p>Your verification code is <b>$code</b>.</p><p><a href=\\\"https://example.com/verify?token=smoke$code\\\">Verify email</a></p>\"}" >/dev/null
got=$($CLI wait "$addr" --code --timeout 3m)
echo "got: $got after $(( $(date +%s) - started ))s"
link=$($CLI wait "$addr" --link --timeout 10s)
echo "link: $link"
$CLI rm "$addr" >/dev/null
[ "$got" = "$code" ] && [ "$link" = "https://example.com/verify?token=smoke$code" ] && echo "PASS" || { echo "FAIL"; exit 1; }
