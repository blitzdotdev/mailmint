# Replace synthetic extractor fixtures with real (scrubbed) mail

## Why this matters
The 47 fixtures in `worker/tests/fixtures/extract/` were written from knowledge of each service's format, not
captured. Several URL shapes (Vercel, Linear, Figma, Stripe, Cloudflare, PayPal, Docker Hub, OpenAI) are guesses.

## What to change
Now that the instance is live, sign up to these services with burnermail addresses, download the raw `.eml`
(`burnermail read <id> --raw`), scrub personal data, and replace/add fixtures plus `expected.json` entries.

## Acceptance
Every fixture is a real capture (noted in a header comment) and the extractor suite still passes.
