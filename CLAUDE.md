# mailmint: notes for agents working on this repo

Self-hosted disposable email on Cloudflare (see README.md, CONTEXT.md for terms). npm workspaces: `worker/` (the Worker), `cli/` (the `mailmint` npm CLI). `harness/` is the black-box test runner.

## Commands

- `npm run check`: tsc for the worker.
- `npm test -w worker`: unit tests (`node --test --experimental-strip-types`). Modules imported by tests must stay strip-types compatible: no enums, no parameter properties, explicit `.ts` imports.
- `node harness/run.mjs [NN|NN-MM] [--continue] [--keep]`: starts its own `wrangler dev` with throwaway state and runs `harness/scenarios/NN-*.mjs`. Email is injected through `/cdn-cgi/handler/email`. Run it after any behaviour change.
- `bash scripts/deploy.sh deploy|smoke|dev`. `deploy` runs check, tests, remote D1 migrations, `wrangler deploy`, `scripts/catch-all.sh` (Email Routing catch-all → Worker), then the smoke test.

## Rules

- Every surface (REST, share link, admin, MCP) goes through `worker/src/api/ops.ts` + `store/*`. Don't put rules in a surface.
- Errors: throw `ApiError(status, code, message)`; codes are the `ErrorCode` union in `lib/errors.ts`.
- Request bodies and query strings reject unknown fields (400 `unknown_field`).
- Never store a raw token or key; hash with `sha256Hex`.
- Email content is untrusted. HTML is only ever served by `htmlResponse` (CSP sandbox, no scripts). Attachments are always `application/octet-stream` downloads.
- New behaviour gets a harness scenario; extractor changes get a fixture in `worker/tests/fixtures/extract/` plus an entry in `expected.json`.
- Schema changes: add `worker/migrations/NNNN_*.sql` (hand-written SQL, no ORM).
- Never deploy without the user asking. The hosted instance is mail.aisocket.dev on the agent-socket Cloudflare account; details in docs/aisocket-instance.md.
- Don't `rm` files; move them to `.trash/` (gitignored).
