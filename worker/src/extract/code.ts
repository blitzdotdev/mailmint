// Verification-code (OTP) extraction: generate candidates, score each by
// keyword proximity, layout and emphasis, and reject anything that looks like a
// year, price, phone number, date, address, order/tracking number or promo code.
//
// Ideas adapted (see ATTRIBUTION.md):
// - dreamhunter2333/cloudflare_temp_email extract_code.ts (MIT): normalisation
//   (zero-width removal, full-width folding, masking URLs/emails), multilingual
//   keywords, "keyword on the previous line" and "is your ... code" patterns,
//   number-boundary rules, YYYYMMDD/year rejection.
// - mailslot/mailslot extract.ts (MIT): additive scoring with date/phone/price
//   penalties, subject bonus, returning each code once.

import type { EmphasisRange } from './html.ts';
import { INVISIBLE_RE } from './html.ts';
import {
	DATE_WORD_RE,
	DELIM_END_RE,
	ENTER_VERB_RE,
	FOOTER_LINE_RE,
	NEGATED_CODE_PREFIX_RE,
	NEGATIVE_LABEL_END_RE,
	PROMO_RE,
	STRONG_RE,
	VERIFY_CONTEXT_RE,
	WEAK_RE,
} from './keywords.ts';

export type SourceKind = 'subject' | 'text' | 'html';

export interface CodeSource {
	kind: SourceKind;
	/** Already cleaned with cleanText() (html sources come from parseHtml, which cleans). */
	text: string;
	emphasis: EmphasisRange[];
}

export interface ScoredCode {
	value: string;
	score: number;
	context: string;
}

/** Codes scoring below this are not reported at all. */
export const CODE_MIN_SCORE = 30;
/** The top code must reach this to become best.code. */
export const CODE_BEST_SCORE = 45;
export const MAX_CODES = 5;

/** Verification codes sit near the top; bounding input keeps CPU time predictable. */
const MAX_SOURCE_CHARS = 60_000;
/** Scoring is candidates × keyword hits; real verification mails have a handful of numbers. */
const MAX_CANDIDATES = 300;

type Shape = 'digits' | 'grouped3' | 'grouped4' | 'spaced' | 'pairs' | 'prefixed' | 'alnum' | 'capsGrouped';

interface Candidate {
	raw: string;
	value: string;
	start: number;
	end: number;
	shape: Shape;
}

interface KeywordHit {
	start: number;
	end: number;
	strong: boolean;
}

/** CRLF → LF and drop invisible characters. Not length-preserving; run once per source. */
export function cleanText(s: string): string {
	return s.replace(/\r\n?/g, '\n').replace(INVISIBLE_RE, '');
}

/**
 * Length-preserving normalisation so offsets keep matching emphasis ranges:
 * fold full-width digits/letters, turn exotic spaces into ' ', and blank out
 * URLs and email addresses (their digits are never codes).
 */
function normalize(s: string): string {
	const out = s
		.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
		.replace(/[  -   　\t]/g, ' ')
		.replace(/\b(?:https?:\/\/|www\.)[^\s<>"'）)\]]+/gi, (m) => ' '.repeat(m.length))
		.replace(/\bmailto:\S+/gi, (m) => ' '.repeat(m.length));
	return out.includes('@') ? out.split('\n').map((line) => (line.includes('@') ? line.replace(EMAIL_RE, blank) : line)).join('\n') : out;
}

const EMAIL_RE = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g;
const blank = (m: string): string => ' '.repeat(m.length);

// Characters that may not touch a numeric code on the left / right.
const LATIN_OR_CYRILLIC = 'A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF';
const BAD_BEFORE_DIGITS = new RegExp(`[${LATIN_OR_CYRILLIC}0-9_+#$€£¥₹₩₽@/\\\\.\\-–]`);
const BAD_AFTER_DIGITS = new RegExp(`[${LATIN_OR_CYRILLIC}0-9_%@/]`);
const CURRENCY_BEFORE_RE =
	/(?:[$€£¥₹₩₽¢]|R\$|US\$|C\$|A\$|NT\$|(?<![A-Za-z])(?:USD|EUR|GBP|INR|RS|RMB|CNY|JPY|CHF|AUD|CAD|BRL|MXN|KRW|RUB|SGD|HKD|IDR|RP|PHP|THB|VND|TRY|ZAR|PLN|SEK|NOK|DKK)\.?)\s?$/i;
const UNIT_AFTER_RE =
	/^\s?(?:%|‰|(?:px|pt|em|rem|vh|vw|dpi|kb|mb|gb|tb|kbps|mbps|kg|g|lbs?|oz|km|mi|miles|m|cm|mm|ml|l|usd|eur|gbp|inr|rmb|cny|jpy|chf|aud|cad|points?|pts|items?|people|persons?|users|members|followers|subscribers|reviews|ratings|stars|views|likes|downloads|installs|teams|companies|customers|countries|cities|stores|locations|orders|years?|yrs|months?|weeks?|days?|hours?|hrs?|minutes?|mins?|seconds?|secs?|times|sq|ft|feet|calories|kcal|steps|words|pages|tickets|seats|units|pcs|pieces)(?![\p{L}]))/iu;
const CJK_UNIT_AFTER_RE = /^\s?[元円원块塊年月日号號時时分秒点點個个件位名人次万萬亿億歳岁]/u;
const SENTENCE_END_RE = /[.!?。！？](?:\s|$)/;
const STREET_AFTER_RE =
	/^\s+(?:[NSEW]\.?\s+)?(?:[A-Z][\p{L}.'-]*\s+){0,4}(?:Street|St|Avenue|Ave|Road|Rd|Parkway|Pkwy|Way|Boulevard|Blvd|Drive|Dr|Lane|Ln|Place|Pl|Court|Ct|Terrace|Ter|Highway|Hwy|Square|Sq|Circle|Cir|Plaza|Row|Alley|Real|Broadway)\b\.?/u;
const US_STATE_BEFORE_RE = /(?<![A-Za-z])(?:A[KLRZ]|C[AOT]|D[CE]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY]),?\s+$/;
const POSTAL_BEFORE_RE = /(?:〒|(?<![A-Za-z])(?:CP|PLZ|ZIP|CEP|Postcode|Postal Code)\.?:?)\s?$/i;
const CITY_AFTER_RE = /^\s+[A-ZÄÖÜÉÈ][a-zäöüßéèàç]+/;
const LIST_SEP_BEFORE_RE = /(?:^|[,·|•\n])\s*$/;

const STRIP_DECORATION_RE = /^[\s*_"'“”‘’「」『』【】\[\]()（）<>:：#>-]+|[\s*_"'“”‘’「」『』【】\[\]()（）<>.:：。!,-]+$/g;

function findCandidates(t: string): Candidate[] {
	const out: Candidate[] = [];
	// Characters covered by accepted candidates; later passes skip anything overlapping them.
	const taken = new Uint8Array(t.length);
	const overlaps = (s: number, e: number): boolean => {
		for (let i = s; i < e; i++) if (taken[i]) return true;
		return false;
	};
	const accept = (c: Candidate): void => {
		out.push(c);
		taken.fill(1, c.start, c.end);
	};

	// A. Letter-prefixed digits: Google's "G-123456", "SGD-604187". Value is the digits.
	for (const m of t.matchAll(/(?<![\p{L}\p{N}_-])([A-Z]{1,3})-(\d{4,10})(?![\p{L}\p{N}_]|[-.,:/]\d)/gu)) {
		const s = m.index ?? 0;
		const e = s + m[0].length;
		accept({ raw: m[0], value: m[2] ?? '', start: s, end: e, shape: 'prefixed' });
	}

	// B. Digit runs with single-character separators; the structure decides whether it is code-like.
	for (const m of t.matchAll(/\d+(?:[ \-–.\/:,]\d+)*/g)) {
		const raw = m[0];
		const s = m.index ?? 0;
		const e = s + raw.length;
		if (overlaps(s, e)) continue;
		const before = t[s - 1] ?? '';
		const after = t[e] ?? '';
		if (before && BAD_BEFORE_DIGITS.test(before)) continue;
		if (after && BAD_AFTER_DIGITS.test(after)) continue;
		if (after === '-' && /[\p{L}\p{N}]/u.test(t[e + 1] ?? '')) continue;
		const seps = raw.replace(/\d/g, '');
		const groups = raw.split(/[^\d]/);
		const lens = groups.map((g) => g.length);
		const [l0 = 0, l1 = 0] = lens;
		let shape: Shape | null = null;
		let cs = s;
		let ce = e;
		if (/[.\/:,–]/.test(seps)) shape = null; // decimal, thousands, date, time, IP, version, range
		else if (lens.length === 1) shape = l0 >= 4 && l0 <= 10 ? 'digits' : null;
		else if (lens.every((l) => l === 1) && lens.length >= 4 && lens.length <= 8 && /^ +$/.test(seps)) shape = 'spaced';
		else if (lens.length === 2 && l0 === 3 && l1 === 3) shape = 'grouped3';
		else if (lens.length === 2 && l0 === 4 && l1 === 4) shape = 'grouped4';
		else if (lens.length === 3 && lens.every((l) => l === 2) && /^ +$/.test(seps)) shape = 'pairs';
		else if (lens.length === 2 && seps === ' ' && l0 >= 4 && l0 <= 10 && l1 <= 2) {
			// "验证码 482913 5分钟内有效" / "code 482913 5 minutes": the small number is separate.
			shape = 'digits';
			ce = s + l0;
		} else if (lens.length === 2 && seps === ' ' && l1 >= 4 && l1 <= 10 && l0 <= 2) {
			shape = 'digits';
			cs = e - l1;
		}
		if (!shape) continue;
		if (CURRENCY_BEFORE_RE.test(t.slice(Math.max(0, cs - 6), cs))) continue;
		const tail = t.slice(ce, ce + 16);
		if (UNIT_AFTER_RE.test(tail) || CJK_UNIT_AFTER_RE.test(tail)) continue;
		const cand = t.slice(cs, ce);
		accept({ raw: cand, value: cand.replace(/\D/g, ''), start: cs, end: ce, shape });
	}

	// C. Alphanumeric codes: "X7K9QP", "AB12-CD34", "kq381-7bz2m", Slack's "KQZ-DMT".
	for (const m of t.matchAll(/(?<![\p{L}\p{N}_\-+\/.@#&=:])([A-Za-z0-9]{2,12}(?:-[A-Za-z0-9]{2,8}){0,2})(?![\p{L}\p{N}_\/@]|-[\p{L}\p{N}]|[.,:][\p{L}\p{N}])/gu)) {
		const raw = m[1] ?? '';
		const s = m.index ?? 0;
		const e = s + raw.length;
		if (!/[A-Za-z]/.test(raw) || overlaps(s, e)) continue;
		const core = raw.replace(/-/g, '');
		if (core.length < 4 || core.length > 12) continue;
		const capsGrouped = /^[A-Z]{3,4}-[A-Z]{3,4}$/.test(raw);
		const mixed = /\d/.test(core) && /[A-Za-z]/.test(core);
		if (!capsGrouped && !mixed) continue;
		if (mixed && !plausibleAlnum(raw, core)) continue;
		accept({ raw, value: raw, start: s, end: e, shape: capsGrouped ? 'capsGrouped' : 'alnum' });
	}
	return out;
}

/** Reject word-like or unit-like alphanumerics ("1Password", "SAVE20", "100px", "v2", "x86"). */
function plausibleAlnum(raw: string, core: string): boolean {
	if (/[A-Za-z]{5,}/.test(core)) return false;
	if (/^[A-Za-z]{3,}\d{1,2}$/.test(core)) return false;
	if (/^\d{1,4}[A-Za-z]{1,4}$/.test(core) && !raw.includes('-')) return false;
	if (/^[vV]\d/.test(core)) return false;
	if (/^(?:utf|iso|sha|md\d|h26|x86|x64|mp\d|ipv|win\d|ios\d|cve|rfc|covid|usb|hdmi|ps\d|gpt|ddr|lte|wifi|rgb|hex|id\d)/i.test(core)) return false;
	// Lowercase-only letters with a long letter run read like words ("abc123" is fine, "hello2" isn't).
	if (/[a-z]{4,}/.test(core) && !/[A-Z]/.test(core) && (core.match(/\d/g) ?? []).length < 3) return false;
	return true;
}

function keywordHits(t: string): KeywordHit[] {
	const hits: KeywordHit[] = [];
	for (const m of t.matchAll(STRONG_RE)) {
		const s = m.index ?? 0;
		const word = m[0];
		// Bare "code"/"código" preceded by promo/zip/tracking/... is not a one-time code.
		if (/^(?:codes?|c[óo]digos?|codice|kod\p{L}?|код)$/iu.test(word) && NEGATED_CODE_PREFIX_RE.test(t.slice(Math.max(0, s - 28), s))) continue;
		hits.push({ start: s, end: s + word.length, strong: true });
	}
	for (const m of t.matchAll(WEAK_RE)) {
		const s = m.index ?? 0;
		hits.push({ start: s, end: s + m[0].length, strong: false });
	}
	return hits;
}

function lineBounds(t: string, pos: number): [number, number] {
	const ls = t.lastIndexOf('\n', pos - 1) + 1;
	let le = t.indexOf('\n', pos);
	if (le < 0) le = t.length;
	return [ls, le];
}

const BASE: Record<Shape, number> = {
	digits: 0, // depends on length, see baseScore
	grouped3: 12,
	grouped4: 4,
	spaced: 10,
	pairs: 10,
	prefixed: 17,
	alnum: 8,
	capsGrouped: 8,
};

function baseScore(c: Candidate): number {
	if (c.shape !== 'digits') return BASE[c.shape];
	const n = c.value.length;
	return n === 6 ? 12 : n === 4 ? 6 : n === 5 ? 8 : n <= 8 ? 9 : 2;
}

function isYear(c: Candidate): boolean {
	if (c.shape !== 'digits' || c.value.length !== 4) return false;
	const n = Number(c.value);
	return n >= 1900 && n <= 2099;
}

function isDate8(c: Candidate): boolean {
	if (c.shape !== 'digits' || c.value.length !== 8) return false;
	const y = Number(c.value.slice(0, 4));
	const mo = Number(c.value.slice(4, 6));
	const d = Number(c.value.slice(6, 8));
	return y >= 1900 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

interface Scored {
	value: string;
	score: number;
	context: string;
	order: number;
}

function scoreSource(src: CodeSource, hasContext: boolean, subjectNamesCode: boolean, order: number): Scored[] {
	const original = src.text.length > MAX_SOURCE_CHARS ? src.text.slice(0, MAX_SOURCE_CHARS) : src.text;
	const t = normalize(original);
	const candidates = findCandidates(t).slice(0, MAX_CANDIDATES);
	if (candidates.length === 0) return [];
	const hits = keywordHits(t);
	const out: Scored[] = [];

	for (const c of candidates) {
		const { start: s, end: e } = c;
		const [ls, le] = lineBounds(t, s);
		const lineBefore = t.slice(ls, s);
		const lineAfter = t.slice(e, le);

		// Hard rejections from what directly labels the number.
		if (NEGATIVE_LABEL_END_RE.test(t.slice(Math.max(ls, s - 48), s))) continue;
		if (c.shape === 'digits' || c.shape === 'grouped3') {
			if (STREET_AFTER_RE.test(lineAfter)) continue;
			if (c.value.length === 5 && US_STATE_BEFORE_RE.test(lineBefore)) continue;
			if (POSTAL_BEFORE_RE.test(lineBefore)) continue;
			if ((c.value.length === 4 || c.value.length === 5) && CITY_AFTER_RE.test(lineAfter) && LIST_SEP_BEFORE_RE.test(lineBefore)) continue;
		}

		const isolated = t.slice(ls, le).replace(STRIP_DECORATION_RE, '') === c.raw;

		// Keyword proximity: keep the single best signal.
		let kw = 0;
		let tight = false;
		let strongHit = false;
		for (const k of hits) {
			let v = 0;
			let isTight = false;
			if (k.end <= s) {
				if (s - k.end > 260) continue;
				const gap = t.slice(k.end, s);
				const nl = gap.includes('\n');
				const sentenceBreak = SENTENCE_END_RE.test(gap);
				if (!nl && gap.length <= 32 && !/\d/.test(gap) && !sentenceBreak) {
					v = k.strong ? 40 : 14;
					isTight = true;
				} else if (!nl && gap.length <= 48 && !sentenceBreak && DELIM_END_RE.test(gap)) {
					v = k.strong ? 34 : 10;
					isTight = true;
				} else if (isolated && nl && gap.length <= 220 && (gap.match(/\n/g) ?? []).length <= 4 && !/\d{4}/.test(gap)) {
					v = k.strong ? 30 : 8;
					isTight = true;
				} else if (!nl && gap.length <= 120) {
					v = k.strong ? 20 : 6;
				}
			} else if (k.start >= e) {
				if (k.start - e > 80) continue;
				const gap = t.slice(e, k.start);
				if (gap.includes('\n')) continue;
				if (gap.length <= 40 && !/\d/.test(gap) && !SENTENCE_END_RE.test(gap)) {
					v = k.strong ? 38 : 10;
					isTight = true;
				} else {
					v = k.strong ? 16 : 4;
				}
			}
			if (v > kw) {
				kw = v;
				tight = isTight && k.strong;
				strongHit = k.strong;
			}
		}
		// Subject "Your verification code" + a body line that is just the number.
		if (subjectNamesCode && src.kind !== 'subject' && isolated && kw < 24) kw = 24;
		// "Enter 832-901 to continue" / "use 4821 to verify": a verb directly before the
		// number counts as a label, but only in a mail that reads like verification.
		const verbBefore = ENTER_VERB_RE.test(t.slice(Math.max(ls, s - 40), s));
		if (verbBefore && hasContext && kw < 28) {
			kw = 28;
			tight = false;
		}
		if (kw === 0) continue; // precision first: no keyword, no code
		const alnum = c.shape === 'alnum' || c.shape === 'capsGrouped';
		if (alnum && !(tight && strongHit)) continue;

		let score = baseScore(c) + kw;
		if (isolated) score += 10;
		const weight = src.emphasis.reduce((w, r) => (r.start <= s && r.end >= e ? Math.max(w, r.weight) : w), 0);
		score += [0, 6, 10, 13, 15][Math.min(weight, 4)] ?? 0;
		if (verbBefore) score += 12;
		if (src.kind === 'subject') score += 10;

		// Soft penalties.
		const lineText = t.slice(ls, le);
		if (FOOTER_LINE_RE.test(lineText) && !tight) score -= 30;
		const near = t.slice(Math.max(ls, s - 60), Math.min(le, e + 60));
		if (PROMO_RE.test(near)) {
			if (alnum) continue;
			score -= 30;
		}
		if (isYear(c)) {
			const around = t.slice(Math.max(ls, s - 16), Math.min(le, e + 16));
			if (DATE_WORD_RE.test(around)) continue;
			score -= tight ? 0 : 30;
		}
		if (isDate8(c)) {
			if (!tight) continue;
			score -= 15;
		}
		if (!hasContext) score -= 20;

		const ctxStart = Math.max(0, s - 30);
		const ctxEnd = Math.min(original.length, e + 30);
		const context = original.slice(ctxStart, ctxEnd).replace(/\s+/g, ' ').trim();
		out.push({ value: c.value, score, context, order: order * 1_000_000 + s });
	}
	return out;
}

/** True when the message reads like a verification / sign-in mail. */
export function hasVerificationContext(texts: string[]): boolean {
	for (const t of texts) {
		if (!t) continue;
		const n = normalize(t.length > MAX_SOURCE_CHARS ? t.slice(0, MAX_SOURCE_CHARS) : t);
		if (VERIFY_CONTEXT_RE.test(n)) return true;
		if (keywordHits(n).some((h) => h.strong)) return true;
	}
	return false;
}

export function extractCodes(sources: CodeSource[]): ScoredCode[] {
	const hasContext = hasVerificationContext(sources.map((s) => s.text));
	const subject = sources.find((s) => s.kind === 'subject')?.text ?? '';
	const subjectNamesCode = keywordHits(normalize(subject)).some((h) => h.strong);
	const merged = new Map<string, Scored & { inSubject: boolean; inBody: boolean }>();
	sources.forEach((src, i) => {
		for (const sc of scoreSource(src, hasContext, subjectNamesCode, i)) {
			const prev = merged.get(sc.value);
			const inSubject = src.kind === 'subject';
			if (!prev) {
				merged.set(sc.value, { ...sc, inSubject, inBody: !inSubject });
				continue;
			}
			prev.inSubject ||= inSubject;
			prev.inBody ||= !inSubject;
			if (sc.score > prev.score) {
				prev.score = sc.score;
				prev.context = sc.context;
			}
			prev.order = Math.min(prev.order, sc.order);
		}
	});
	const list = [...merged.values()].map((m) => ({ ...m, score: m.score + (m.inSubject && m.inBody ? 8 : 0) }));
	return list
		.filter((c) => c.score >= CODE_MIN_SCORE)
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.slice(0, MAX_CODES)
		.map((c) => ({ value: c.value, score: c.score, context: c.context }));
}
