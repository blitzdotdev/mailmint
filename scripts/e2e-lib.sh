#!/usr/bin/env bash
# Helpers for end-to-end runs against the live instance, driving a real Chrome tab
# through an agent-socket link. Source it from a bash script:
#   AS_LINK=https://agentsocket.dev/v1/t/<token> . scripts/e2e-lib.sh
# Needs .env (MAILMINT_URL, MAILMINT_KEY, SMOKE_SENDER_URL, SMOKE_SECRET).
MM_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$MM_ROOT/.env"; set +a
E2E_STATE="$MM_ROOT/.trash/e2e"; mkdir -p "$E2E_STATE"
: "${AS_LINK:?set AS_LINK to the agent-socket link without /agents.md}"
AS_BASE="${AS_LINK%/agents.md}"   # AS_LINK=… . lib only scopes AS_LINK to the sourcing

# Browser tool call: tab <tool> '<json>'
tab() { curl -s -X POST "$AS_BASE/$1" -H 'content-type: application/json' -d "${2:-{\}}"; }
# Page text of a selector (default main), whitespace-collapsed.
text() { tab get_text "{\"selector\":\"${1:-main}\"}" | node -e 'const j=JSON.parse(require("fs").readFileSync(0));process.stdout.write((j.text??JSON.stringify(j)).replace(/\s+/g," ").trim()+"\n")'; }
url() { tab page_info | node -e 'console.log(JSON.parse(require("fs").readFileSync(0)).url)'; }
go() { tab navigate "{\"url\":\"$1\"}" >/dev/null; }
# Real email through Cloudflare Email Sending: send '<json>' (to, subject, text, html, attachments, headers, from_name)
send() { curl -sf -X POST "$SMOKE_SENDER_URL" -H "x-smoke-secret: $SMOKE_SECRET" -H 'content-type: application/json' -d "$1"; }
# Owner API: api METHOD /v1/path [json]
api() { curl -s -X "$1" "$MAILMINT_URL$2" -H "authorization: Bearer $MAILMINT_KEY" ${3:+-H 'content-type: application/json' -d "$3"}; }
# JSON field: jq-lite via node: jf '<js expr on j>'
jf() { node -e "const j=JSON.parse(require('fs').readFileSync(0));const v=($1);console.log(typeof v==='string'?v:JSON.stringify(v))"; }
# Wait (server long-poll) for mail in an inbox: waitmail <address> [query]
waitmail() { api GET "/v1/inboxes/$1/wait?timeout=60${2:+&$2}"; }
check() { if eval "$2"; then echo "  PASS $1"; else echo "  FAIL $1"; FAILS=$((FAILS+1)); fi; }
FAILS=0
