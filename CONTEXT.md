# burnermail glossary

**Inbox**: one address (`name@domain`) and its mail. Mail to `name+tag@domain` belongs to the same Inbox.
_Avoid_: mailbox, account.

**Created inbox** (`origin: api`): made through the API, CLI, MCP or dashboard. Has a share link and a lifetime chosen at creation.

**Catch-all inbox** (`origin: auto`): made automatically when mail arrives for an address nobody created. Owner-only (no share link until the owner issues one) and expires `AUTO_TTL_HOURS` after its latest message.

**Owner**: whoever controls the instance: holds an API key, passes Cloudflare Access for `/admin`, or approved an MCP client. Can see every Inbox.

**API key** (`bm_key_…`): owner credential for the REST API and CLI. Shown once; only its SHA-256 is stored.

**Share link** (`/i/bm_in_…`): capability URL for exactly one Inbox. The token in it doubles as a Bearer token for that Inbox on `/v1`. Issuing a new one revokes the old.
_Avoid_: public link, magic link (a magic link is something the *mail* contains).

**Tag**: the `+tag` part of the recipient address, recorded on the message and usable as a wait filter.

**Extraction**: codes (OTPs) and links found in a message when it is stored. `code` / `link` are the confident best picks; `codes` / `links` list all candidates.

**Wait**: long-poll for the first message with id > `since` matching the filters. Returns a `cursor` to continue from. Woken by the **InboxSignal** Durable Object, never by polling.

**Purge**: the hourly cron that deletes expired Inboxes with their D1 rows, R2 objects and signal state.
