#!/usr/bin/env bash
# Read recent mail straight from the remote D1 (handy when you have wrangler creds but no API key).
#   bash scripts/read-mail.sh          # last 20 messages
#   bash scripts/read-mail.sh <id>     # one message's text body
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
q() { (cd worker && npx wrangler d1 execute DB --remote --json --command "$1" 2>/dev/null); }
if [ $# -eq 0 ]; then
  q "select m.id, m.received_at, m.envelope_to, m.from_address, m.subject, m.best_code from messages m order by m.id desc limit 20" |
    node -e 'for (const r of JSON.parse(require("fs").readFileSync(0))[0].results) console.log([r.id, r.received_at, r.envelope_to, r.from_address, r.subject, r.best_code ?? ""].join("\t"))'
else
  [[ "$1" =~ ^[0-9]+$ ]] || { echo "id must be a number" >&2; exit 2; }
  q "select envelope_to, from_address, subject, received_at, best_code, best_link, text_body, raw_key from messages where id = $1" |
    node -e 'const r = JSON.parse(require("fs").readFileSync(0))[0].results[0]; if (!r) process.exit(1); console.log(`To: ${r.envelope_to}\nFrom: ${r.from_address}\nSubject: ${r.subject}\nDate: ${r.received_at}\nCode: ${r.best_code ?? ""}\nLink: ${r.best_link ?? ""}\nRaw: r2://burnermail-raw/${r.raw_key}\n\n${r.text_body ?? "(no text body)"}`)'
fi
