# Attribution

The extractor in this directory is an original implementation. It adapts rules and ideas from the projects below; their licenses permit this with attribution.

## dreamhunter2333/cloudflare_temp_email

- Source: https://github.com/dreamhunter2333/cloudflare_temp_email, file `worker/src/email/extract_code.ts`
- License: MIT, Copyright (c) 2023 Dream Hunter
- Used in `keywords.ts` and `code.ts`:
  - the multilingual code keyword lists (Chinese, Japanese, Korean, Spanish, Portuguese, Italian, French, German, Turkish/Polish, Russian, Hebrew)
  - the exclusions for bare "code" (promo, zip, tracking, error and similar)
  - normalisation: removing zero-width characters, folding full-width digits and letters, and blanking URLs and email addresses so their digits are never candidates
  - the "keyword on the previous line" and "`<code>` is your … code" patterns
  - number-boundary rules (not part of an amount, decimal, time or phone number)
  - rejection of 1900–2099 years and of YYYYMMDD dates

That file credits 2FHey for some of its keyword lists and test messages, and the credit carries over here:

- 2FHey: https://github.com/SoFriendly/2fhey, CC0-1.0

## mailslot/mailslot

- Source: https://github.com/mailslot/mailslot, file `packages/core/src/extract.ts`
- License: MIT, Copyright (c) 2026 Fadhli Rahim
- Used in `code.ts` and `link.ts`:
  - additive scoring of code candidates instead of first-match-wins
  - penalties for dates, phone numbers and prices
  - a bonus for codes found in the subject
  - returning each code once
  - collecting HTML hrefs before bare text URLs, and stripping trailing punctuation from URLs

## MIT License text (applies to both MIT sources above)

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Test fixtures

`worker/tests/fixtures/extract/real-*.eml` (5) are real verification emails captured from headless sign-ups by `scripts/signup-e2e.mjs`, scrubbed by `scripts/capture-fixture.mjs` (recipient, sender local parts and long tokens replaced). Every other `*.eml` (47) is synthetic: each one is written to match the structure, wording and footer of the named service's real email as closely as public knowledge allows. They contain no real personal data: addresses are at `@aisocket.dev` or `example` domains, and tokens are generated.
