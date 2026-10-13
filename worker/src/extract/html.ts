// Dependency-free HTML handling for email bodies: entity decoding and a small
// tokenizer that turns HTML into line-structured text while recording anchors
// and visually emphasised spans (big / bold / letter-spaced / monospace).
//
// Email HTML is table soup with inline styles, MSO conditional comments and
// unclosed tags, so this is deliberately forgiving: it never throws, and an
// unmatched close tag is ignored.

export interface Anchor {
	href: string;
	/** Visible anchor text plus alt text of images inside it. */
	text: string;
	/** Offset of the anchor in HtmlDoc.text (for ordering). */
	pos: number;
}

export interface EmphasisRange {
	start: number;
	end: number;
	/** 1..4: one point each for bold, big, letter-spaced, monospace. */
	weight: number;
}

export interface HtmlDoc {
	/** Visible text. Every block element boundary is a single '\n'. */
	text: string;
	anchors: Anchor[];
	emphasis: EmphasisRange[];
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
	zwnj: '', zwj: '', lrm: '', rlm: '', shy: '',
	copy: '©', reg: '®', trade: '™', mdash: '—', ndash: '–', hellip: '…', bull: '•', middot: '·',
	lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', sbquo: '‚', bdquo: '„', laquo: '«', raquo: '»',
	euro: '€', pound: '£', yen: '¥', cent: '¢', dollar: '$', times: '×', divide: '÷', deg: '°',
	rarr: '→', larr: '←', uarr: '↑', darr: '↓', hearts: '♥', star: '☆', check: '✓',
	auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
	eacute: 'é', egrave: 'è', ecirc: 'ê', aacute: 'á', agrave: 'à', acirc: 'â', iacute: 'í', oacute: 'ó',
	uacute: 'ú', ntilde: 'ñ', Ntilde: 'Ñ', ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', otilde: 'õ', iexcl: '¡', iquest: '¿',
	num: '#', percnt: '%', colon: ':', semi: ';', comma: ',', period: '.', excl: '!', quest: '?', sol: '/',
	lpar: '(', rpar: ')', lsqb: '[', rsqb: ']', equals: '=', plus: '+', commat: '@', lowbar: '_', verbar: '|',
};

/** Decode HTML character references. Unknown named entities are left as-is. */
export function decodeEntities(s: string): string {
	if (s.indexOf('&') < 0) return s;
	return s.replace(/&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[A-Za-z][A-Za-z0-9]{1,31});?/g, (m, body: string) => {
		if (body.charCodeAt(0) === 35 /* # */) {
			const n = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return '';
			return String.fromCodePoint(n);
		}
		const v = NAMED_ENTITIES[body];
		return v === undefined ? m : v;
	});
}

/** Invisible characters used as preheader padding or to break up codes. */
export const INVISIBLE_RE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁪-⁯ㅤ﻿ﾠ]/g;

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const BLOCK_TAGS = new Set([
	'address', 'article', 'aside', 'blockquote', 'br', 'caption', 'center', 'dd', 'div', 'dl', 'dt', 'fieldset',
	'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main',
	'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul', 'body', 'html',
]);
// Tags that implicitly close an open element of the same name (common unclosed <p>/<li>/<td>).
const SELF_NESTING_CLOSES = new Set(['p', 'li', 'td', 'th', 'tr', 'dt', 'dd', 'option']);

const MAX_HTML = 600_000;
/** Stop collecting text after this many characters (codes and action links sit near the top). */
const MAX_TEXT = 150_000;
/** Unclosed-tag soup must not make close-tag matching quadratic. */
const MAX_DEPTH = 256;
/** Only short emphasised elements count: a whole bold paragraph is not "highlighted". */
const MAX_EMPHASIS_CHARS = 60;

/**
 * Applied to one `<…>` slice found with indexOf (never to the whole document): a
 * global tag regex that fails at every `<` of unclosed-tag soup is quadratic.
 * Trade-off: a `>` inside a quoted attribute value ends the tag early.
 */
const TAG_SLICE_RE = /^<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)([^>]*)>$/;
/** Longest style attribute inspected for emphasis; real ones are far shorter. */
const MAX_STYLE = 2048;
const ATTR_RE = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;

function parseAttrs(raw: string): Map<string, string> {
	const out = new Map<string, string>();
	if (!raw) return out;
	ATTR_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = ATTR_RE.exec(raw)) !== null) {
		const name = (m[1] ?? '').toLowerCase();
		if (!name || out.has(name)) continue;
		out.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ''));
	}
	return out;
}

// Flags: 1 bold, 2 big, 4 letter-spaced, 8 monospace.
const BOLD = 1;
const BIG = 2;
const SPACED = 4;
const MONO = 8;

function styleFlags(tag: string, attrs: Map<string, string>): number {
	let f = 0;
	if (tag === 'b' || tag === 'strong') f |= BOLD;
	if (tag === 'h1' || tag === 'h2' || tag === 'h3') f |= BOLD | BIG;
	if (tag === 'h4' || tag === 'h5' || tag === 'h6') f |= BOLD;
	if (tag === 'code' || tag === 'pre' || tag === 'kbd' || tag === 'samp' || tag === 'tt') f |= MONO;
	if (tag === 'font') {
		const size = parseInt(attrs.get('size') ?? '', 10);
		if (size >= 5) f |= BIG;
	}
	const style = attrs.get('style');
	if (style) {
		const s = style.slice(0, MAX_STYLE).toLowerCase();
		const fs = /font-size\s*:\s*([\d.]+)\s*(px|pt|em|rem|%)?/.exec(s);
		if (fs) {
			const v = parseFloat(fs[1] ?? '0');
			const unit = fs[2] ?? 'px';
			const px = unit === 'pt' ? v * 1.333 : unit === 'em' || unit === 'rem' ? v * 16 : unit === '%' ? (v / 100) * 16 : v;
			if (px >= 20) f |= BIG;
		}
		const ls = /letter-spacing\s*:\s*(-?[\d.]+)\s*(px|pt|em|rem)?/.exec(s);
		if (ls) {
			const v = parseFloat(ls[1] ?? '0');
			const unit = ls[2] ?? 'px';
			if ((unit === 'em' || unit === 'rem') ? v >= 0.1 : v >= 1.5) f |= SPACED;
		}
		if (/font-family\s*:[^;]{0,200}?(monospace|courier|consolas|menlo|monaco|sfmono|sf mono|ui-monospace|lucida console|roboto mono|source code)/.test(s)) f |= MONO;
		const fw = /font-weight\s*:\s*(bold|bolder|[6-9]00)/.exec(s);
		if (fw) f |= BOLD;
	}
	return f;
}

function popcount(f: number): number {
	return (f & BOLD ? 1 : 0) + (f & BIG ? 1 : 0) + (f & SPACED ? 1 : 0) + (f & MONO ? 1 : 0);
}

interface OpenEl {
	tag: string;
	start: number;
	/** Index of the first text chunk inside this element. */
	chunk: number;
	flags: number; // effective (inherited) flags
	href: string | null;
	alts: string[];
}

/**
 * Strip parts of an HTML document that never carry visible text:
 * comments (incl. MSO conditional blocks), <head>, <style>, <script>, <title>, <xml>.
 */
const INVISIBLE_OPEN_RE = /<!--|<(style|script|title|xml|template|noscript|head)\b/gi;
/** Unclosed, these run to the end of the document (as in browsers); the rest just drop their opening tag. */
const RUNS_TO_END = new Set(['style', 'script']);

function stripInvisible(html: string): string {
	// One forward pass with indexOf / sticky searches: lazy `[\s\S]*?` regexes over the
	// whole document go quadratic on unclosed `<!--` or `<style>` repeated many times.
	const out: string[] = [];
	let pos = 0;
	// Once `</name>` isn't found ahead of some point it never will be later on:
	// remember that, or repeated unclosed `<head>` rescans the document each time.
	const noClose = new Set<string>();
	INVISIBLE_OPEN_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = INVISIBLE_OPEN_RE.exec(html)) !== null) {
		const start = m.index;
		let end: number;
		if (m[0] === '<!--') {
			const close = html.indexOf('-->', start + 4);
			end = close === -1 ? html.length : close + 3;
		} else {
			const name = (m[1] ?? '').toLowerCase();
			let close: RegExpExecArray | null = null;
			if (!noClose.has(name)) {
				const closeRe = new RegExp(`</${name}\\s*>`, 'gi');
				closeRe.lastIndex = start + m[0].length;
				close = closeRe.exec(html);
				if (!close) noClose.add(name);
			}
			if (close) end = close.index + close[0].length;
			else if (RUNS_TO_END.has(name)) end = html.length;
			else {
				const gt = html.indexOf('>', start);
				end = gt === -1 ? html.length : gt + 1;
			}
		}
		out.push(html.slice(pos, start), ' ');
		pos = end;
		if (end >= html.length) break;
		INVISIBLE_OPEN_RE.lastIndex = end;
	}
	out.push(html.slice(pos));
	return out.join('');
}

/** Convert email HTML to text + anchors + emphasis ranges. */
export function parseHtml(input: string): HtmlDoc {
	const html = stripInvisible(input.length > MAX_HTML ? input.slice(0, MAX_HTML) : input);
	// Text is accumulated as chunks with a running length: indexing into a growing
	// concatenated string makes V8 re-flatten it each time (quadratic on big mails).
	const chunks: string[] = [];
	let len = 0;
	let lastChar = 10; // pretend the document starts after a newline
	const anchors: Anchor[] = [];
	const emphasis: EmphasisRange[] = [];
	const stack: OpenEl[] = [];

	const push = (s: string): void => {
		chunks.push(s);
		len += s.length;
		lastChar = s.charCodeAt(s.length - 1);
	};
	const newline = (): void => {
		// Turn a trailing space into the newline (keeps every recorded offset valid); never double '\n'.
		if (len === 0 || lastChar === 10) return;
		if (lastChar === 32) {
			const i = chunks.length - 1;
			const c = chunks[i] ?? '';
			chunks[i] = c.slice(0, -1) + '\n';
			lastChar = 10;
			return;
		}
		push('\n');
	};
	const appendText = (raw: string): void => {
		if (len >= MAX_TEXT) return;
		let s = decodeEntities(raw).replace(INVISIBLE_RE, '').replace(/[\s\u00a0\u2000-\u200a\u202f\u205f\u3000]+/g, ' ');
		if (!s) return;
		if (s.charCodeAt(0) === 32 && (lastChar === 32 || lastChar === 10)) s = s.slice(1);
		if (s) push(s);
	};
	/** Text from chunk index `from` onward, at most `max` characters. */
	const textFrom = (from: number, max: number): string => {
		let out = '';
		for (let i = from; i < chunks.length && out.length < max; i++) out += chunks[i];
		return out.length > max ? out.slice(0, max) : out;
	};
	const closeEl = (el: OpenEl): void => {
		const span = len - el.start;
		if (span > 0 && (el.href !== null || (el.flags && span <= MAX_EMPHASIS_CHARS + 16))) {
			const content = textFrom(el.chunk, el.href !== null ? 400 : span);
			const lead = content.length - content.replace(/^\s+/, '').length;
			const body = content.trim();
			const s = el.start + lead;
			if (el.flags && body && span <= MAX_EMPHASIS_CHARS + 16 && body.length <= MAX_EMPHASIS_CHARS) {
				emphasis.push({ start: s, end: s + body.length, weight: popcount(el.flags) });
			}
			if (el.href !== null) {
				const label = [body, ...el.alts].join(' ').replace(/\s+/g, ' ').trim().slice(0, 200);
				anchors.push({ href: el.href, text: label, pos: s });
			}
		} else if (el.href !== null) {
			anchors.push({ href: el.href, text: el.alts.join(' ').trim().slice(0, 200), pos: el.start });
		}
		if (BLOCK_TAGS.has(el.tag)) newline();
	};

	let last = 0;
	let pos = 0;
	while (pos < html.length) {
		if (len >= MAX_TEXT) break;
		const lt = html.indexOf('<', pos);
		if (lt === -1) break;
		const gt = html.indexOf('>', lt + 1);
		if (gt === -1) break; // no complete tag left: the rest is text
		const m = TAG_SLICE_RE.exec(html.slice(lt, gt + 1));
		if (!m) {
			const next = html[lt + 1];
			if (next === '!' || next === '?') {
				// doctype / processing instruction / stray markup declaration
				if (lt > last) appendText(html.slice(last, lt));
				last = pos = gt + 1;
			} else {
				pos = lt + 1; // a literal '<' in text
			}
			continue;
		}
		if (lt > last) appendText(html.slice(last, lt));
		last = pos = gt + 1;
		const name = m[2] ?? '';
		const tag = name.toLowerCase();
		const closing = m[1] === '/';
		if (closing) {
			let i = stack.length - 1;
			while (i >= 0 && stack[i]?.tag !== tag) i--;
			if (i < 0) {
				if (BLOCK_TAGS.has(tag)) newline();
				continue;
			}
			while (stack.length > i) {
				const el = stack.pop();
				if (el) closeEl(el);
			}
			continue;
		}
		const rawAttrs = m[3] ?? '';
		const attrs = parseAttrs(rawAttrs);
		if (tag === 'img') {
			const alt = attrs.get('alt');
			if (alt) {
				for (let i = stack.length - 1; i >= 0; i--) {
					const el = stack[i];
					if (el && el.href !== null) {
						el.alts.push(alt);
						break;
					}
				}
			}
		}
		if (BLOCK_TAGS.has(tag)) newline();
		if (VOID_TAGS.has(tag) || /\/\s*$/.test(rawAttrs)) continue;
		if (SELF_NESTING_CLOSES.has(tag) && stack.length > 0 && stack[stack.length - 1]?.tag === tag) {
			const el = stack.pop();
			if (el) closeEl(el);
		}
		const parentFlags = stack.length > 0 ? (stack[stack.length - 1]?.flags ?? 0) : 0;
		const href = tag === 'a' || tag === 'area' ? (attrs.get('href') ?? '').trim() : null;
		if (stack.length >= MAX_DEPTH) continue;
		stack.push({ tag, start: len, chunk: chunks.length, flags: parentFlags | styleFlags(tag, attrs), href, alts: [] });
	}
	if (last < html.length && len < MAX_TEXT) appendText(html.slice(last));
	while (stack.length > 0) {
		const el = stack.pop();
		if (el) closeEl(el);
	}
	return { text: chunks.join(''), anchors, emphasis };
}
