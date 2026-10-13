# mailmint

Self-hosted disposable email on Cloudflare, built for testing sign-up flows by hand **and by AI agents**.

Mail to any `<anything>@your-domain` is accepted by a catch-all Email Routing rule and stored by a Worker.
Verification codes and links are extracted when the mail arrives, and a long-poll `wait` endpoint returns the
moment a matching message lands, so an agent can do this in two calls:

```sh
addr=$(npx mailmint new)                    # quiet-otter-4k7m@your-domain
# … submit $addr in the sign-up form …
code=$(npx mailmint wait "$addr" --code)     # blocks until the code arrives → 482913
```

Why not sharklasers / mail.tm / 10minutemail? Their domains are on every disposable-email blocklist, the mail sits
on someone else's server, and none of them give agents a "wait for the code" call. A private domain you own has
none of those problems.

## Features

- **Catch-all inboxes.** Any address on your domain receives mail. Addresses nobody created become owner-only
  inboxes that expire 24 h after their last message. Optional strict mode accepts created addresses only.
- **Code and link extraction** at ingest: a scored extractor that ignores prices, years, phone and order numbers,
  tested against a corpus of real-world verification emails (GitHub, Google, Microsoft, Slack, Stripe, Clerk,
  Supabase, Auth0, … plus Chinese, Japanese, German and Spanish mail).
- **Instant `wait`.** A Durable Object per address wakes waiting requests the moment mail is stored (no polling).
  Filters: sender, subject, plus-address tag, "has a code", "has a link".
- **Plus addressing.** `name+github@domain` lands in `name@domain` tagged `github`.
- **Four ways in**, all over the same operations:
  - **CLI** (`npx mailmint`): zero dependencies, prints just the code with `--code`, honours `HTTPS_PROXY`.
  - **REST API** with owner API keys.
  - **Share links**: every created inbox has a capability URL (`/i/<token>`) that reads that one inbox with no
    other credential. It serves a live web page to browsers and an `agents.md` card to agents.
  - **MCP** at `/mcp` with OAuth (you approve each client).
  - **Any AI chat via [agent-socket](https://agentsocket.dev)**: "Connect an AI chat" on `/admin/connect` (or
    `mailmint connect` in a terminal) prints an `agentsocket.dev/…/agents.md` link. Paste it into claude.ai,
    ChatGPT or any chat that can make HTTP calls, and it gets create/wait/read tools with owner access while the
    tab (or process) runs. No MCP setup needed.
- **Owner dashboard** at `/admin` (behind Cloudflare Access): every inbox, latest mail with codes, API keys.
- Sandboxed HTML rendering (no scripts, remote images off by default), attachments, raw `.eml` download.
- TTLs and an hourly purge; per-inbox, per-day and size caps so a catch-all domain can't be flooded.

## How it works

```
sender ──SMTP──► Cloudflare Email Routing (catch-all *@domain)
                       │
                       ▼
              Worker email() ── postal-mime ── extract codes/links
                 │        │
                 │        ├──► R2   raw .eml + attachments
                 │        └──► D1   inboxes, messages (+ codes/links), API keys
                 ▼
          InboxSignal DO (one per address) ── wakes ──► GET …/wait (long-poll)

REST /v1 (API key) ─┐
/i/<token> (link)  ─┼──► shared operations ──► D1 / R2 / DO
/mcp (OAuth)       ─┤
/admin (Access)    ─┘
```

One Worker, no build step beyond `wrangler`. TypeScript, Hono, hono/jsx server-rendered UI.

## API

Auth: `Authorization: Bearer <api key>` (owner) or `Bearer <inbox token>` (one inbox). Errors are
`{"error":{"code","message"}}`. The live instance serves the same reference at `/agents.md`.

| Method | Path | |
|---|---|---|
| POST | `/v1/inboxes` | `{"local"?, "domain"?, "ttl_hours"?, "label"?}` → `{address, token, url, expires_at, …}` |
| GET | `/v1/inboxes` | list (`?q=` search) |
| GET | `/v1/inboxes/{address}` | one inbox (`{address}` may be just the name part) |
| PATCH | `/v1/inboxes/{address}` | `{"ttl_hours"?, "label"?}` |
| DELETE | `/v1/inboxes/{address}` | delete it and its mail |
| GET | `/v1/inboxes/{address}/messages` | `?since=&limit=&order=asc\|desc` |
| GET | `/v1/inboxes/{address}/wait` | `?since=0\|latest&timeout=25 (≤300)&from=&subject=&tag=&extract=code\|link` → `{message, timed_out, cursor}` |
| GET | `/v1/messages/{id}` | full message: `text`, `code`, `codes`, `link`, `links`, attachments, `html_url`, `raw_url` |
| GET | `/v1/messages/{id}/html` · `/raw` · `/attachments/{n}` | sandboxed HTML · `.eml` · download |
| GET | `/v1/me` | who the key belongs to |

Share links expose the same calls under `/i/<token>/…` (`/wait`, `/messages`, `/messages/{id}`, `/inbox`,
`DELETE /i/<token>`), scoped to that inbox.

## CLI

Zero dependencies, Node 22.21+, one file. Until it's on npm, run it from a checkout (`node cli/bin/mailmint.mjs …`)
or copy it onto your PATH: `install -m 755 cli/bin/mailmint.mjs ~/.local/bin/mailmint`.

For Claude Code, `skills/mailmint/SKILL.md` teaches agents the workflow. Copy the folder into
`~/.claude/skills/`, or in [aibox](https://github.com/blitzdotdev/aibox) run `aibox skill add skills/mailmint`
once to give every project's sandbox the skill (the CLI login stays per project).

```
mailmint login --url https://mail.example.com --key mm_key_…   # key from /admin/keys
mailmint new [name] [--ttl 1d] [--label TEXT]
mailmint wait <inbox> [--code|--link] [--from X] [--subject X] [--tag T] [--since ID|latest] [--timeout 2m]
mailmint ls [inbox]
mailmint read <id> [--text|--html|--raw]
mailmint rm <inbox>
mailmint connect [--relay URL]     # agent-socket link for any AI chat; runs until Ctrl-C
```

`<inbox>` can be an address, its name part, or a share link (then no key is needed). `--json` everywhere.
Exit code 2 means `wait` timed out.

## Deploy your own

See [docs/self-host.md](docs/self-host.md). In short: a domain on Cloudflare **used only for this** (catch-all
routing works on apex domains only), Email Routing enabled on it, a Cloudflare Access application for `/admin`
and `/authorize`, then `bash scripts/deploy.sh deploy`.

## Development

```sh
npm install
npm run check                     # tsc
npm test -w worker                # unit tests: extractor corpus, address/token/filter/auth rules
node harness/run.mjs              # black-box scenarios against a local wrangler dev (real D1/R2/DO simulators)
bash scripts/deploy.sh dev        # local server on :8787; inject mail with:
curl -X POST 'http://localhost:8787/cdn-cgi/handler/email?from=a@example.com&to=test@aisocket.dev' \
  -H 'Content-Type: message/rfc822' --data-binary @worker/tests/fixtures/extract/github-device-verification.eml
```

`worker/.dev.vars` with `DEV_BYPASS_ACCESS=1` opens `/admin` and `/authorize` on localhost hosts only.

## Security model

- The owner (API keys, Access-protected dashboard, OAuth-approved MCP clients) can read everything.
- A share link reads exactly one inbox. Tokens and keys carry 192 random bits; only SHA-256 digests are stored.
  Failed authentication is rate limited per IP.
- Knowing an address grants nothing: catch-all inboxes have no link until the owner creates one.
- Email content is untrusted. HTML renders under a CSP sandbox with no scripts, from a response that can't be
  framed elsewhere; attachments are always downloads. Agent-facing docs and MCP tool descriptions tell agents
  never to follow instructions found in mail.

See [SECURITY.md](SECURITY.md).

## License

Apache-2.0. Includes code adapted from [cf-mailroom](https://github.com/wong2/cf-mailroom) (Apache-2.0) and
extraction rules from MIT-licensed projects; see [NOTICE](NOTICE).
