# Make blitzdotdev/mailmint public

## Why this matters
The repo is private, but the npm package (`mailmint@0.1.0`) is already public, and so is the hosted instance at mail.aisocket.dev.
A pre-publication audit (2026-10-14) found no live credentials anywhere in history. It did find internal ops
content, production resource IDs, and a few hygiene gaps. Docs that overstated what exists were corrected the same day.

## Decisions needed first
1. **History.** The 15 private commits contain:
   - `PLAN.md` and `docs/aisocket-instance.md`: the internal Access policy names, the account name, token names, and setup logs.
   - The D1/KV ids of the old burnermail resources and of the current production resources.
   - An earlier `real-claude-magic-link.eml` that still carries a per-recipient sender id.
   - `Claude-Session:` trailers.

   None of these is a secret.

   Options:
   - **(a) Publish the history as is.**
   - **(b) Publish one fresh initial commit.** Build it from a copy of the tree in a new `git init` directory, then
     force-push to `main`. This is irreversible on the remote and needs explicit approval.

   Recommended: (b), because it is the only option that keeps the instance runbook and old fixture out of the
   public repo for good.
2. **Internal docs.**
   - `docs/aisocket-instance.md` moves to a private place (the teeny monorepo, next to the other instance notes).
   - The research and decisions in `PLAN.md` become a trimmed `docs/design.md`: existing options, platform
     constraints, the design. Account/token details and the competitor assessment are dropped.
3. **`scripts/signup-e2e.mjs`.** This script automates sign-ups on third-party services. Choose one:
   - Keep it, with a header saying to run it only against services you own or are allowed to test, and remove the
     captcha notes from `issues/open/extract-real-fixtures.md`.
   - Keep it private, alongside the instance runbook.

## What to change (in order)
1. **Config for self-hosters.** Follow the agent-socket layout in `worker/wrangler.jsonc`:
   - The top level is a generic deploy: `MAIL_DOMAINS` from the deployer, no Access AUD/team, and no D1/KV ids
     (wrangler creates them).
   - Production values live in `env.production`. Every binding is repeated there with a "keep in sync" comment.
   - `scripts/deploy.sh deploy` uses `--env production`.
   - Smoke-test before and after, because this touches the live deploy.
2. **`scripts/smoke-sender/wrangler.jsonc`.** `FROM` becomes a required var, documented in `docs/self-host.md`, and not
   hardcoded to agentsocket.dev.
3. **OSS files**, matching agent-socket:
   - `CONTRIBUTING.md`, `CHANGELOG.md` (0.1.0), and `.env.example` listing variable names and token scopes.
   - `PRIVACY.md`: what the hosted instance stores, for how long, and who can read it.
   - `.github/ISSUE_TEMPLATE/`, and a PR template.
4. **CI.** Add `.github/workflows/ci.yml` on Node 22: `npm ci`, `npm run check`, `npm test`, `node harness/run.mjs`.
   The repo token can't push workflow files, so the user pushes this one.
5. **Run the audit again on the final tree**, then confirm with the user:
   - grep for secrets and ids;
   - `cd cli && npm pack --dry-run`;
   - unit tests and the harness.
6. **Go public** (user-approved step):
   - Set visibility to public, enable private vulnerability reporting, and point `SECURITY.md` at
     `https://github.com/blitzdotdev/mailmint/security/advisories/new`.
   - Fix the repo description (it has a trailing space), set the homepage and topics, and turn off the wiki.
7. **npm follow-ups.** On the user's Mac:
   - Publish `mailmint@0.1.1`, which now has `repository`, `bugs` and a GitHub `homepage`.
   - Run `npm deprecate mailmint@0.0.0-stage "placeholder"`.
8. **Cloudflare tidy-up.** Rename the Access app ("burnermail admin") and the deploy token (`burnermail-deploy`) to mailmint.
   (The old burnermail D1/KV no longer exist; checked through the API on 2026-10-14.)

## Acceptance
- The public repo contains no instance runbook, no production ids at the top level of `wrangler.jsonc`, and no internal plan.
- CI is green on the public repo.
- `npx mailmint@latest --help` shows 0.1.1, and its npm page links to the repo.
- A fresh clone, followed by `docs/self-host.md`, deploys to a new account without editing ids.
