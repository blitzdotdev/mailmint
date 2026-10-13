// Public API: pull the verification code (OTP) and verification / magic /
// reset link out of an inbound email. Pure, dependency-free and synchronous;
// runs in the Workers runtime and under `node --experimental-strip-types`.
//
// Scoring overview (details in code.ts / link.ts):
// - Codes: candidates are 4–10 digit numbers (optionally "123 456" / "123-456",
//   spaced digits, or letter-prefixed like "G-123456" → "123456") and
//   alphanumerics that mix letters and digits (or Slack-style "ABC-DEF").
//   A candidate needs a code keyword nearby (multilingual); it gains points for
//   being directly labelled, sitting alone on its line under a label line,
//   visual emphasis in HTML, an "enter/use" verb, and appearing in the subject.
//   Years, prices, phone numbers, dates/times, postal codes, street numbers,
//   order/tracking/reference numbers, promo codes, URLs and CSS never qualify.
// - Links: anchors and bare URLs, redirect wrappers unwrapped, boilerplate
//   dropped; scored by URL path/query words, anchor text (or the sentence before
//   a bare URL), presence of a token, and whether the subject reads like a
//   verification/sign-in mail.

import { extractCodes, cleanText, CODE_BEST_SCORE } from './code.ts';
import type { CodeSource } from './code.ts';
import { parseHtml } from './html.ts';
import { collectAnchorLinks, collectTextLinks, extractLinks, LINK_BEST_SCORE } from './link.ts';

export interface ExtractInput {
	subject: string;
	text: string | null;
	html: string | null;
	from?: string | null;
}

export interface CodeCandidate {
	value: string;
	score: number;
	/** ~60 characters around the code, whitespace collapsed to a single line. */
	context: string;
}

export interface LinkCandidate {
	url: string;
	score: number;
	kind: 'verify' | 'magic' | 'reset' | 'other';
	/** Anchor text when the link came from an HTML anchor, else ''. */
	text: string;
}

export interface Extraction {
	codes: CodeCandidate[];
	links: LinkCandidate[];
	best: { code: string | null; link: string | null };
}

export { CODE_MIN_SCORE, CODE_BEST_SCORE } from './code.ts';
export { LINK_MIN_SCORE, LINK_BEST_SCORE, unwrapRedirects } from './link.ts';

export function extract(input: ExtractInput): Extraction {
	const subject = cleanText(input.subject ?? '').replace(/\n/g, ' ');
	const text = input.text ? cleanText(input.text) : null;
	const doc = input.html ? parseHtml(input.html) : null;

	const sources: CodeSource[] = [{ kind: 'subject', text: subject, emphasis: [] }];
	if (text) sources.push({ kind: 'text', text, emphasis: [] });
	if (doc && doc.text) sources.push({ kind: 'html', text: doc.text, emphasis: doc.emphasis });
	const codes = extractCodes(sources);

	const raws = [
		...(doc ? collectAnchorLinks(doc.anchors, 0) : []),
		...(doc ? collectTextLinks(doc.text, 1_000_000) : []),
		...(text ? collectTextLinks(text, 2_000_000) : []),
	];
	const links = extractLinks(raws, subject, input.from);

	const topCode = codes[0];
	const topLink = links[0];
	return {
		codes,
		links,
		best: {
			code: topCode && topCode.score >= CODE_BEST_SCORE ? topCode.value : null,
			link: topLink && topLink.score >= LINK_BEST_SCORE ? topLink.url : null,
		},
	};
}
