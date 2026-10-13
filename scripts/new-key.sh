#!/usr/bin/env bash
# Mint an owner API key straight into the remote D1 (no browser / Access needed).
# Prints the key once; only its SHA-256 is stored.
#   bash scripts/new-key.sh <name>
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
name="${1:?usage: new-key.sh <name>}"
[[ "$name" =~ ^[A-Za-z0-9._\ -]{1,80}$ ]] || { echo "name: letters, digits, space . _ - only" >&2; exit 2; }
read -r key hash prefix < <(node -e '
  const c = require("crypto");
  const key = "bm_key_" + c.randomBytes(24).toString("base64url");
  console.log(key, c.createHash("sha256").update(key).digest("hex"), key.slice(0, 11));
')
(cd worker && npx wrangler d1 execute DB --remote --command \
  "INSERT INTO api_keys (name, key_hash, prefix, created_by) VALUES ('$name', '$hash', '$prefix', 'scripts/new-key.sh')" >/dev/null)
echo "$key"
