# Replace synthetic extractor fixtures with real (scrubbed) mail

## Why this matters
47 of the 52 fixtures in `worker/tests/fixtures/extract/` were written from knowledge of each service's format, not
captured. Several URL shapes (Vercel, Linear, Figma, Stripe, Cloudflare, PayPal, Docker Hub, OpenAI) are guesses.

## What to change
Now that the instance is live, sign up to these services with mailmint addresses, download the raw `.eml`
(`mailmint read <id> --raw`), scrub personal data, and replace/add fixtures plus `expected.json` entries.

## Acceptance
Every fixture is a real capture (noted in a header comment) and the extractor suite still passes.

## Progress 2026-10-13

`scripts/signup-e2e.mjs` drives real sign-up / login-code forms in headless Chromium with fresh
mailmint addresses; `scripts/capture-fixture.mjs` turns a captured mail into a scrubbed fixture.
Real captures now in the corpus (`real-*.eml`): Notion signup code, Substack create-account
(Mailgun click-tracked link), Perplexity sign-in (magic link with numeric token), claude.ai magic
link, Vercel "no account" (negative). Two extractor bugs found and fixed by them (tracked links
under-scored; numeric `token=` params not treated as tokens); fail-before verified against the
previous extractor.

Blocked for headless from this network (need a real browser + human): Slack (reCAPTCHA), Linear,
Cursor and Airtable (Cloudflare/"verify it's you"), Framer, Render, GitHub ("access restricted").
No mail without a captcha step: Figma, Canva, Resend, Railway, Hugging Face (flows need more steps).
Next: capture those through a real Chrome (agent-socket session with other sites allowed).
