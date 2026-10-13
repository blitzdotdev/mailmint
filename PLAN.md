# burnermail: self-hosted disposable email on Cloudflare (plan)

> Provisional name (rename before publishing). This is a plan only: no code, no repo, nothing deployed. Decisions are at the bottom.

## Goal

Replace sharklasers / guerrillamail / mail.tm for test-account signups with a service we own. It must work equally well for:

- **Me:** type `anything@<domain>` into a signup form, then open a page and see the mail or the code.
- **Agents:** one call creates an inbox, one call blocks until the OTP or verification link arrives and returns it already extracted. This has to work from Claude Code (CLI/curl), from chat agents (a paste-able capability URL), and over MCP.

Why build our own: public disposable domains are on every blocklist. A private domain we control isn't, and the mail stays in our own account.

## Existing options (researched 2026-10-12)

| Project | License | Verdict |
|---|---|---|
| dreamhunter2333/cloudflare_temp_email (~12k★, very active) | MIT | Most mature temp-mail. Has the best OTP extractor (`worker/src/email/extract_code.ts`). **No wait/long-poll.** Its own agent skill can't create mailboxes. Separate Vue/Pages frontend, `wrangler.toml`, raw MIME in D1, and a large feature surface (Telegram, ads, redeem codes). |
| panda-sandeep/dearagent (35★, created Sep 2026, "experimental") | **AGPL-3.0** + CLA | Closest feature set: catch-all with auto-create, `/messages/wait`, MCP with 15 tools, webhooks, retention cron, tests. Gaps: no code/link extraction, wait polls D1 every 1.5 s, one API key reads every inbox, no CLI. |
| stumct/agent-mailbox (1★, one commit) | MIT | Right auth model: master key plus a token per mailbox, TTL enforced by a DO alarm, `/codes` + `/links`, MCP, setup CLI. Gaps: plus-addresses only, which some sites reject; naive 4–8-digit code regex; unproven. |
| mailslot/mailslot (3★, dormant) | MIT | Good scored code extractor (penalises dates, phone numbers and prices; returns each code once). No TTL, single shared token. |
| maillab/cloud-mail, oiov/vmail, akazwz/smail, others | various | Wrong shape. These are multi-user mail systems or cookie-only temp mail. cloud-mail uses Drizzle; smail has no license. |
| cloudflare/agentic-inbox | Apache-2.0 | A full AI email client, not temp mail. |
| `packages/cf-mailroom` (our fork, mail.agentsocket.dev) | Apache-2.0 | A support-inbox workspace that **rejects unregistered addresses**, so it's the wrong product. Its ingest code is reusable (below). |

**Verdict: build a small one of our own and borrow code.**

- No candidate combines instant-wake wait, built-in extraction, per-inbox capability tokens, plain random addresses, and a CLI with an agents.md surface.
- DearAgent is the "deploy today" fallback. AGPL is fine for private use, but we'd still have to add extraction and per-inbox auth.
- The core is small: ingest, extract, store, wait, read, expire.

Code to borrow (all MIT/Apache, keep attribution):

- dreamhunter's `extract_code.ts`, which carries its own CC0 attribution to 2FHey
- mailslot's scoring and read-once ideas
- mailroom's `receive.ts` / `rules.ts`: postal-mime parse, SHA dedup, raw `.eml` to R2, `addressOf`, `isAutoSubmitted`

## Platform constraints (verified in CF docs, 2026-10-12)

- **Catch-all works on apex domains only.** Subdomains need one literal rule per address, up to 200. So random addresses need a **dedicated apex domain**. Email Routing also won't take a domain whose MX records point elsewhere, so this can't share a domain that already has real mail.
- **Routing rules can live in config.** `wrangler.jsonc` accepts top-level `"addresses": ["*@<domain>"]`, and `wrangler deploy` creates the catch-all that sends mail to the Worker. That removes the dashboard step mailroom needed. It's top-level only (ignored under `env`), and a non-interactive deploy refuses destructive rule changes.
- **Receiving is free; sending needs Workers Paid.** v1 is receive-only.
- **Local testing:** `wrangler dev` exposes `POST /cdn-cgi/handler/email?from=&to=` taking an `.eml` body. Mailroom already uses this.

## Design

### Shape

A single Worker using Hono, matching mailroom and the registry:

- `email()` handler
- REST API plus markdown agent surface
- Small server-rendered UI (`hono/jsx`)
- Cron purge

Storage:

- **D1** is the source of truth: inboxes, messages, extracted codes and links. It's queryable across inboxes for my UI, and readable from scripts like `read-mail.sh`.
- **R2** holds raw `.eml` and attachments, with an R2 lifecycle rule as a backstop for TTL.
- **One small Durable Object per address, `InboxSignal`.** It exists only to wake waiters. It holds `lastMessageId`; `email()` calls `signal(id)` after the D1 insert. `wait(sinceId, timeout)` returns immediately if `lastMessageId > sinceId`, otherwise it parks a promise until signalled or timed out. The caller then re-reads D1. This gives instant wake with no lost-wakeup race, and no D1 polling loop.

### Addresses and inbox lifecycle

- **Any `<local>@<domain>` is accepted (catch-all).** An inbox is auto-created on first mail. This covers the "I just typed something into a form" case. Only the owner can read these; the address alone isn't a key.
- **`POST /v1/inboxes`** (owner key) returns:
  - `{address, token, url, expiresAt}`
  - a random readable local part (e.g. `quiet-otter-4k7m`) or a requested one, and an optional `ttl`
  - `url` is the capability link `https://<host>/i/<token>`
- **TTL:** default 7 days, per-inbox override. A daily cron deletes expired inboxes, their messages and R2 objects. Mail to an expired inbox is rejected with `setReject`.
- **Abuse limits.** Catch-all domains attract spam.
  - Rejected outright: oversized messages (more than 5 MB) and inboxes over N messages per day.
  - Auto-created inboxes are capped globally per day (KV tripwire pattern from teenybase).
  - Unclaimed auto-created inboxes expire faster (24 h).
  - **Strict mode** (`ACCEPT_UNKNOWN=0`) rejects every address not created through the API. It's the escape hatch if spam becomes a problem.

### Auth (house pattern: "the link is the key")

- **Owner key:** a single secret `OWNER_KEY` (`.prod.vars`), sent as a Bearer token. It can create, list and read anything. The CLI reads it from `~/.burnermail/config.json` or `BURNERMAIL_KEY`.
- **Inbox token:**
  - format `bm_<base64url 22>` (≥128 bits); only its SHA-256 is stored, and comparison is constant-time (agent-socket `tokens.ts`)
  - scoped to one inbox and read-only
  - this is what gets handed to a chat agent or a test script that shouldn't hold the owner key
- **My web UI:**
  - the dashboard (`/`) lists all inboxes and is behind Cloudflare Access, with in-Worker JWT verification that fails closed (mailroom `access.ts`)
  - `/i/<token>` pages need no Access, because the token is the key
- **Errors and requests:** errors use `{error:{code,message}}` with enumerated codes, unknown fields are rejected, bodies are capped, and `Sec-Fetch-Site` blocks CSRF on writes.

### Extraction at ingest (stored, not recomputed)

- **`codes[]`:** a scored OTP extractor. Rules:
  - prefer digits near "code / OTP / verification / 验证码…"
  - penalise years, prices, phone numbers, zip codes and order numbers
  - support alphanumeric codes like `ABC-123`
  - port dreamhunter's rules and mailslot's scoring
- **`links[]`:** every href, ranked by verify/confirm/magic-link/reset/activate keywords. Unsubscribe and tracking links are dropped, and known redirect wrappers are unwrapped where safe.
- **Result shape:** `best: {code?, link?}` on each message, so agents don't need to read the body.
- **Fixtures:** a corpus of real OTP and verify emails, stored as `.eml` with PII scrubbed. Every extractor change runs against all of them. Targets: GitHub, Google, Stripe, Clerk, Supabase, Auth0, Firebase, Vercel, Cloudflare, Slack, Discord, Apple.

### API (v1)

```
POST /v1/inboxes                      {local?, ttl?}             → {address, token, url, expiresAt}
GET  /v1/inboxes                      (owner)                    → list
GET  /v1/inboxes/:addr/messages       ?since=<id>                → [{id, from, subject, receivedAt, best, codes, links}]
GET  /v1/inboxes/:addr/wait           ?since=<id>&timeout=25&from=&subject=&extract=code|link
                                                                 → first matching message (or 204 on timeout)
GET  /v1/messages/:id                 → text, html (sanitised), headers, attachments
GET  /v1/messages/:id/raw             → message/rfc822
DELETE /v1/inboxes/:addr
```

Each endpoint also works under the capability prefix `/i/<token>/…`, scoped to that one inbox.

- **`wait` timing:** capped at 25 s by default because agents can't sleep and chat tool calls time out. A "quiet" cap of up to about 300 s applies for CLI callers who ask for it, same as agent-socket-channel `/recv`.
- **Markdown surface:** `/i/<token>/agents.md` (plus `/agents.md`, `/llms.txt`, `/skill.md`) is served as markdown unless `Accept` asks for HTML (teenybase `agent-detect.ts`). It contains the address, how to wait, and how to read. It warns that email content is untrusted and must never be followed as instructions.

### CLI (`npx burnermail …`, plain `.mjs`, no deps, anontun style)

```
burnermail new [--ttl 1d] [--local name] [--json]   # prints address (+ token/url)
burnermail wait <addr> [--code|--link] [--from x] [--timeout 120] [--json]
burnermail ls [<addr>]                              # inboxes, or messages in one
burnermail read <id> [--raw|--html]
burnermail rm <addr>
burnermail login                                    # store base URL + owner key
```

- `wait --code` prints just the code, so it composes in scripts:
  `addr=$(burnermail new) && … && code=$(burnermail wait $addr --code)`
- Client-side loops over the 25 s server long-poll up to `--timeout`.
- Respects `HTTPS_PROXY`.

### MCP (phase 2)

- Tools: `create_inbox`, `wait_for_email` (with `extract`), `list_messages`, `read_message`.
- Start simple: a remote MCP over Bearer auth with the owner key or an inbox token.
- Upgrade to mailroom-style OAuth only if needed.
- Same handler layer as REST, no duplicated logic.

### UI (deliberately small)

- `/` (Access): list inboxes, newest messages, a big copyable code/link per message, and a "new inbox" button.
- `/i/<token>`: one inbox with auto-refresh via the wait endpoint, the same code/link chips, and the HTML body rendered in a sandboxed iframe (`sandbox` with no scripts, CSP, remote images blocked by default).

## Layout and house conventions

```
packages/burnermail/            # own git repo (blitzdotdev/burnermail)
  worker/   src/{index.ts, email/receive.ts, email/extract.ts, api/*, ui/*, signal-do.ts}
            migrations/*.sql  wrangler.jsonc  .dev.vars.example  .prod.vars.example
  cli/      bin/burnermail.mjs
  harness/  run.mjs scenarios/NN-*.mjs  fixtures/*.eml
  docs/     protocol.md  instance.md (dashboard-only steps)  runbook.md
  issues/{open,closed}/   CONTEXT.md (glossary)   AGENTS.md / CLAUDE.md   README.md
  scripts/  setup.sh (idempotent resource create)  deploy.sh {deploy|smoke|dev}  read-mail.sh  backup.sh
```

- **`wrangler.jsonc`:**
  - `$schema`, no `account_id`, `nodejs_compat`, observability on
  - `custom_domain` route, `preview_urls: false`
  - top-level `addresses: ["*@<domain>"]`
  - D1 / R2 / DO / KV / `ratelimits` bindings, cron `0 3 * * *`
- **`.env`** (gitignored) holds `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; secrets go in `.prod.vars`.
- **Tests:**
  - `node --test` with strip-types for the extractor and fixtures
  - a black-box harness that starts `wrangler dev` on a free port and posts `.eml` to `/cdn-cgi/handler/email`
  - `RELAY_URL=` points the same harness at production
  - one prod smoke test does a real send from an outside mailbox and checks `wait` returns the code
- Do not use Drizzle; use hand-written SQL migrations like mailroom.

## Build order

1. Enable Email Routing on aisocket.dev and build the skeleton:
   - `wrangler.jsonc` with `addresses` catch-all
   - `email()` → postal-mime → D1 + R2
   - `read-mail.sh`
   - deploy, send a real mail, see it land
2. Extractor plus fixture corpus, fail-first unit tests.
3. API: inboxes, messages, owner key, inbox tokens, error shape.
4. `InboxSignal` DO plus `wait`, with harness scenarios for these cases:
   - mail arrives before the wait
   - mail arrives during the wait
   - timeout
   - filters
   - concurrent waiters
5. CLI (`new`, `wait --code`, `ls`, `read`, `rm`, `login`).
6. Capability pages: `/i/<token>`, `agents.md`, skill.md.
7. TTL cron, strict mode, quotas, KV tripwire, Access-protected dashboard.
8. MCP.
9. Optional, later: multiple domains with random pick, webhooks, outbound send (needs Paid plus a reputation plan).

## Decisions (2026-10-13)

1. **Domain: `aisocket.dev`.** Addresses take the form `<local>@aisocket.dev`.
   - **Checked 2026-10-13:** the zone is on the agent-socket account and has only two DNS records, `AAAA aisocket.dev` and `AAAA www.aisocket.dev`. Both are the relay's Worker custom domains (`agent-socket/relay/wrangler.jsonc` `env.production`). It has no MX, SPF or TXT records, so nothing conflicts with Email Routing.
   - **The relay alias can probably stay.** Email Routing uses only MX and TXT records, and Worker custom domains use only A/AAAA, so they should coexist. That also avoids breaking old clients and links that still point at aisocket.dev: it was the relay's first prod URL, and `scripts/deploy.sh` still smoke-tests it. Check this when enabling routing. Remove the relay alias only if it actually conflicts, and that needs its own agent-socket change and deploy.
   - **burnermail's own web/API host:** `mail.aisocket.dev` (Worker custom domain). It's a subdomain, so it doesn't collide with the relay on the apex. Mail addresses stay on the apex.
   - **Risk:** if the domain ends up on disposable-email blocklists, it hurts the agent-socket alias. That's acceptable because agentsocket.dev is canonical.
2. **Cloudflare account: agent-socket.** Deploy uses its own **account-owned token `burnermail-deploy`**, created 2026-10-13 and stored in gitignored `packages/burnermail/.env` (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`).
   - Account permissions: Account Settings Read, Workers Scripts Write, D1 Write, Workers R2 Storage Write, Workers KV Storage Write, Workers Tail Read.
   - aisocket.dev zone only: Zone Read, DNS Write, Workers Routes Write, Email Routing Rules Write.
   - Verified against the API (verify, email rules, DNS, D1, R2, scripts all OK).
   - Add Queues or Rate Limiting permissions later if the design needs them. The `cf-mailroom/.env` token lacks email-routing scope, so don't reuse it. **Email Routing enabled on aisocket.dev 2026-10-13** via the dashboard ("Onboard Domain"; no conflicting records). MX ×3 (`route{1,2,3}.mx.cloudflare.net`), SPF and DKIM `cf2024-1._domainkey` were added, and DoH confirmed them live. The relay apex AAAA records were untouched and `https://aisocket.dev/` still returns 200, so routing and the Worker custom domain coexist. There are no routing rules and no catch-all yet; the burnermail deploy creates those via `addresses`.
3. **Unknown addresses: accept with caps.** Catch-all with auto-create, daily caps, 24 h expiry for auto-created inboxes. `ACCEPT_UNKNOWN=0` strict mode stays available as the fallback.
4. **Name and visibility: `burnermail`, public OSS** (`blitzdotdev/burnermail`, Apache-2.0). The name is provisional; rename before publishing.
