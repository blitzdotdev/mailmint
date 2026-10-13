// Verification / magic / reset link extraction: collect anchors and bare URLs,
// unwrap known redirect wrappers, drop boilerplate (unsubscribe, legal, help,
// social, app stores, images, homepages) and score what is left by URL
// keywords, anchor text and the sentence leading up to a bare URL.

import type { Anchor } from './html.ts';
import { decodeEntities } from './html.ts';
import { VERIFY_CONTEXT_RE } from './keywords.ts';

export type LinkKind = 'verify' | 'magic' | 'reset' | 'other';

export interface ScoredLink {
	url: string;
	score: number;
	kind: LinkKind;
	text: string;
}

/** Links scoring below this are not reported. */
export const LINK_MIN_SCORE = 20;
/** The top link must reach this to become best.link. */
export const LINK_BEST_SCORE = 35;
export const MAX_LINKS = 10;

interface RawLink {
	url: string;
	/** Anchor text (HTML) — empty for bare URLs. */
	text: string;
	/** Sentence leading up to a bare URL, used like anchor text but weighted lower. */
	context: string;
	order: number;
}

const MAX_TEXT_CHARS = 200_000;
const MAX_RAW_LINKS = 400;

// ------------------------------------------------------------------ collection

const BARE_URL_RE = /(?<![\w@.\/=])https?:\/\/[^\s<>"'` 　）】」]+/gi;

/** Longest bare URL considered; longer runs are not verification links. */
const MAX_URL_CHARS = 4096;

function trimUrlTail(u: string): string {
	// Parentheses are counted once and adjusted as characters are trimmed (re-counting
	// on every pass is quadratic for a URL followed by thousands of ')').
	let end = Math.min(u.length, MAX_URL_CHARS);
	let opens = 0;
	let closes = 0;
	for (let i = 0; i < end; i++) {
		const c = u.charCodeAt(i);
		if (c === 40) opens++;
		else if (c === 41) closes++;
	}
	while (end > 0) {
		const last = u[end - 1] ?? '';
		if (/[.,;:!?'"*\]}>]/.test(last)) {
			end--;
			continue;
		}
		if (last === ')' && closes > opens) {
			end--;
			closes--;
			continue;
		}
		break;
	}
	return u.slice(0, end);
}

/** Bare URLs in plain text with the sentence that introduces each one. */
export function collectTextLinks(text: string, orderBase: number): RawLink[] {
	const t = text.length > MAX_TEXT_CHARS ? text.slice(0, MAX_TEXT_CHARS) : text;
	const out: RawLink[] = [];
	let prevEnd = 0;
	for (const m of t.matchAll(BARE_URL_RE)) {
		const s = m.index ?? 0;
		const url = trimUrlTail(m[0].replace(/&amp;/gi, '&'));
		// Context: from the previous URL / paragraph break / sentence end up to this URL.
		const paragraphs = t.slice(Math.max(prevEnd, s - 200), s).split(/\n[ \t]*\n/);
		let ctx = '';
		while (paragraphs.length > 0 && !ctx.trim()) ctx = paragraphs.pop() ?? '';
		const sentence = ctx.search(/[.!?。！？](?=\s)(?![\s\S]*[.!?。！？]\s)/);
		if (sentence >= 0) ctx = ctx.slice(sentence + 1);
		out.push({ url, text: '', context: ctx.replace(/\s+/g, ' ').trim(), order: orderBase + s });
		prevEnd = s + m[0].length;
		if (out.length >= MAX_RAW_LINKS) break;
	}
	return out;
}

export function collectAnchorLinks(anchors: Anchor[], orderBase: number): RawLink[] {
	const out: RawLink[] = [];
	for (const a of anchors.slice(0, MAX_RAW_LINKS)) {
		const url = decodeEntities(a.href).replace(/\s+/g, '');
		out.push({ url, text: a.text, context: '', order: orderBase + a.pos });
	}
	return out;
}

// ------------------------------------------------------------------ redirect unwrapping

const REDIRECT_PATH_RE = /^(?:url|redirect|redir|r|out|away|click|link|track|goto|go|jump|external|exit|outbound|leave|l)(?:\.(?:php|aspx?|jsp|cgi|html?))?$/i;
// Deliberately excludes redirect_to / redirect_uri / return_to / next / continue:
// those belong to the real verification link (OAuth / Supabase), not to a wrapper.
const REDIRECT_PARAMS = ['url', 'u', 'q', 'target', 'redirect', 'redirect_url', 'dest', 'destination', 'to', 'link', 'goto', 'href'];

function httpUrl(s: string | null | undefined): string | null {
	if (!s) return null;
	const v = s.trim();
	if (!/^https?:\/\/[^\s/?#]+/i.test(v)) return null;
	try {
		new URL(v);
		return v;
	} catch {
		return null;
	}
}

function hostIs(host: string, domain: string): boolean {
	return host === domain || host.endsWith('.' + domain);
}

/** One level of unwrapping; returns null when the URL is not a known wrapper. */
function unwrapOnce(raw: string): string | null {
	let u: URL;
	try {
		u = new URL(raw);
	} catch {
		return null;
	}
	const host = u.hostname.toLowerCase();
	const p = u.searchParams;
	const path = u.pathname;

	if (hostIs(host, 'safelinks.protection.outlook.com')) return httpUrl(p.get('url'));
	if (/(^|\.)google\.[a-z.]{2,6}$/.test(host) && path === '/url') return httpUrl(p.get('q') ?? p.get('url'));
	if (['l.facebook.com', 'lm.facebook.com', 'l.messenger.com', 'l.instagram.com', 'l.threads.net'].includes(host)) return httpUrl(p.get('u'));
	if (hostIs(host, 'youtube.com') && path === '/redirect') return httpUrl(p.get('q'));
	if (host === 'out.reddit.com') return httpUrl(p.get('url'));
	if (host === 'slack-redir.net') return httpUrl(p.get('url'));
	if (hostIs(host, 'vk.com') && path === '/away.php') return httpUrl(p.get('to'));
	if (host === 'urldefense.proofpoint.com' && path.startsWith('/v2/url')) {
		const enc = p.get('u');
		if (!enc) return null;
		return httpUrl(safeDecode(enc.replace(/-/g, '%').replace(/_/g, '/')));
	}
	if (host === 'urldefense.com') {
		const m = /^\/v3\/__(.+?)__;/.exec(path + u.search);
		return m ? httpUrl(m[1]) : null;
	}
	if (hostIs(host, 'awstrack.me')) {
		const m = /^\/L\d\/([^/]+)\//.exec(path);
		return m ? httpUrl(safeDecode(m[1] ?? '')) : null;
	}
	// Generic redirector: a redirect-looking last path segment carrying an absolute URL.
	// Never unwrap when the outer URL itself carries a token: then it is the action link
	// (e.g. /auth/link?token=...&to=https://app/home) and the inner URL is just a landing page.
	const lastSeg = path.split('/').filter(Boolean).pop() ?? '';
	if (REDIRECT_PATH_RE.test(lastSeg) && ![...p.keys()].some((k) => /token|ticket|otp|code|magic|verif|confirm|nonce|^k$|^key$/i.test(k))) {
		for (const key of REDIRECT_PARAMS) {
			const v = httpUrl(p.get(key));
			if (v) return v;
		}
	}
	return null;
}

function safeDecode(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

export function unwrapRedirects(url: string): string {
	let cur = url;
	for (let i = 0; i < 3; i++) {
		const next = unwrapOnce(cur);
		if (!next || next === cur) break;
		cur = next;
	}
	return cur;
}

// ------------------------------------------------------------------ classification

const SOCIAL_DOMAINS = [
	'facebook.com', 'fb.com', 'twitter.com', 'x.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'youtu.be', 'tiktok.com',
	'pinterest.com', 'reddit.com', 'threads.net', 'medium.com', 'discord.gg', 't.me', 'telegram.me', 'wa.me', 'snapchat.com',
	'tumblr.com', 'vimeo.com', 'twitch.tv', 'mastodon.social', 'bsky.app', 'weibo.com', 'line.me',
];
const APP_STORE_HOSTS = ['apps.apple.com', 'itunes.apple.com', 'play.google.com', 'appgallery.huawei.com', 'apps.microsoft.com', 'chrome.google.com', 'chromewebstore.google.com'];
const BOILERPLATE_HOST_RE = /^(?:help|support|docs|status|community|forum|forums|blog|careers|jobs|press|investors|legal|privacy|developers?|learn|academy|events|shop|store|productforums)\./i;
const IMAGE_PATH_RE = /\.(?:png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i;

/** URL words that mean the link is boilerplate, never the action link. */
const NEGATIVE_URL_WORDS = new Set([
	'unsubscribe', 'unsub', 'optout', 'unsubscribed', 'preferences', 'preference', 'subscription', 'subscriptions', 'privacy',
	'privacypolicy', 'terms', 'tos', 'legal', 'policies', 'policy', 'help', 'support', 'faq', 'faqs', 'contact', 'careers', 'jobs',
	'press', 'blog', 'webview', 'viewonline', 'report', 'abuse', 'remove', 'revoke', 'unlink', 'deny', 'disavow', 'block', 'smarthelp',
	'datenschutz', 'impressum', 'agb', 'privacidad', 'confidentialite', 'download', 'downloads',
]);
const NEGATIVE_URL_PHRASES_RE = /opt[-_]?out|email[-_]?preferences|notification[-_]?settings|manage[-_]?(?:subscriptions?|notifications?|email)|view[-_]?(?:in[-_]?)?(?:browser|online)|not[-_]?my[-_]?account|wasnt[-_]?me|not[-_]?you\b|list-manage\.com\/(?:unsubscribe|profile)/i;

/** Anchor / context text that marks boilerplate or a security-alert escape hatch. */
const NEGATIVE_TEXT_RE =
	/unsubscribe|opt[\s-]?out|preferences|manage (?:your )?(?:email|subscription|notification)|privacy|terms|policy|policies|help|support|contact|faq|view (?:this (?:email|message) )?(?:in (?:your |a )?browser|online|as a web ?page)|web ?version|download|app store|google play|get it on|follow us|facebook|twitter|instagram|linkedin|youtube|tiktok|pinterest|blog|learn more|read more|change (?:your )?password|not you|not my account|wasn't me|wasn’t me|this wasn|secure your account|remove|report|deny|block|cancel|feedback|survey|careers|press|invite your team|refer a friend|abmelden|datenschutz|impressum|darse de baja|désabonner|se désinscrire|退订|取消订阅|配信停止|수신거부|отписаться/i;

type ActionKind = 'verify' | 'magic' | 'reset';

const TEXT_SIGNALS: Array<[ActionKind, RegExp, number]> = [
	['reset', /\b(?:reset|set (?:a |your )?new password|choose (?:a )?new password|create (?:a )?new password|forgot(?:ten)? (?:your )?password|recover (?:your )?account)\b|zurücksetzen|restablecer|redefinir|réinitialiser|reimposta|сбросить|重置|再設定|재설정/i, 35],
	['verify', /\b(?:verify|verification|confirm|activate|validate|accept(?: (?:the |this |your )?invit\w*)?|join now|join (?:the |this |your )?(?:team|workspace|organi[sz]ation|project|channel|server|group)|complete (?:your )?(?:registration|sign ?up))\b|bestätigen|verifizieren|aktivieren|verificar|confirmar|activar|ativar|vérifier|confirmer|activer|verificare|confermare|подтвердить|подтверждения|确认|確認|验证|驗證|認証|인증|확인/i, 35],
	['magic', /\b(?:log ?in|sign ?in|log me in|sign me in|magic ?link|continue to (?:sign|log))\b|anmelden|iniciar sesi[óo]n|entrar|se connecter|connexion|accedi|войти|登录|登入|ログイン|로그인/i, 30],
];

function urlWords(u: URL): string[] {
	const skipValues = new Set(['redirect_to', 'redirect_uri', 'return_to', 'returnto', 'next', 'continue', 'callback_url', 'success_url', 'cancel_url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']);
	const parts: string[] = [u.pathname];
	for (const [k, v] of u.searchParams) {
		parts.push(k);
		if (!skipValues.has(k.toLowerCase())) parts.push(v);
	}
	parts.push(safeDecode(u.hash.slice(1)));
	return parts
		.join(' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

/** A long random-looking path segment, query value or fragment: what verification links carry. */
function hasTokenLike(u: URL): boolean {
	const values: string[] = [];
	for (const seg of u.pathname.split('/')) values.push(seg);
	for (const [k, v] of u.searchParams) if (!/^utm_|^ref_?$|^lang$|^locale$/i.test(k)) values.push(v);
	for (const piece of safeDecode(u.hash.slice(1)).split(/[&=:#/]/)) values.push(piece);
	return values.some((v) => v.length >= 16 && /\d/.test(v) && /[A-Za-z]/.test(v) && /^[A-Za-z0-9_\-.~%+=]+$/.test(v));
}

function registrableDomain(host: string): string {
	const parts = host.toLowerCase().split('.').filter(Boolean);
	if (parts.length <= 2) return parts.join('.');
	const sld = parts[parts.length - 2] ?? '';
	const tld = parts[parts.length - 1] ?? '';
	// co.uk, com.au, com.ar, co.jp, ...
	if (tld.length === 2 && ['co', 'com', 'net', 'org', 'gov', 'ac', 'edu', 'ne', 'or'].includes(sld)) return parts.slice(-3).join('.');
	return parts.slice(-2).join('.');
}

function senderDomain(from: string | null | undefined): string | null {
	if (!from) return null;
	const m = /@([A-Za-z0-9.-]+)>?\s*$/.exec(from.trim());
	return m && m[1] ? registrableDomain(m[1]) : null;
}

interface UrlSignals {
	verify: number;
	magic: number;
	reset: number;
	explicit: LinkKind | null;
}

function urlSignals(u: URL, words: string[]): UrlSignals {
	const sig: UrlSignals = { verify: 0, magic: 0, reset: 0, explicit: null };
	const has = (pred: (w: string) => boolean): boolean => words.some(pred);
	if (has((w) => w.includes('verif') || w.includes('confirm') || w.includes('activat') || w.includes('validat'))) sig.verify = 30;
	else if (has((w) => w.startsWith('invit') || w === 'accept' || w === 'join')) sig.verify = 25;
	if (has((w) => w.includes('magic') || w.includes('loginwith') || w.includes('passwordless') || w === 'emaillogin')) sig.magic = 35;
	else if (has((w) => w.includes('login') || w.includes('signin') || w === 'logon' || w === 'otp') || /sign[-_]?in|log[-_]?in/i.test(u.pathname)) sig.magic = 20;
	else if (has((w) => w === 'auth' || w === 'callback' || w === 'sso')) sig.magic = 8;
	if (has((w) => w.includes('reset') || w.includes('forgot'))) sig.reset = 30;
	else if (has((w) => w === 'password' || w === 'passwd')) sig.reset = 10;

	// Explicit type parameters (Supabase/GoTrue, Firebase, Netlify Identity fragments).
	const type = (u.searchParams.get('type') ?? '').toLowerCase();
	const mode = (u.searchParams.get('mode') ?? '').toLowerCase();
	const frag = u.hash.toLowerCase();
	if (type === 'magiclink' || mode === 'signin' || mode === 'emailsignin') sig.explicit = 'magic';
	else if (type === 'recovery' || mode === 'resetpassword' || frag.includes('recovery_token=')) sig.explicit = 'reset';
	else if (['signup', 'invite', 'email_change', 'email'].includes(type) || mode === 'verifyemail' || mode === 'verifyandchangeemail' || frag.includes('confirmation_token=') || frag.includes('invite_token=')) sig.explicit = 'verify';
	if (sig.explicit === 'magic') sig.magic = Math.max(sig.magic, 35);
	if (sig.explicit === 'reset') sig.reset = Math.max(sig.reset, 35);
	if (sig.explicit === 'verify') sig.verify = Math.max(sig.verify, 30);
	return sig;
}

function textSignals(s: string, weight: number): Record<ActionKind, number> {
	const out = { verify: 0, magic: 0, reset: 0 };
	if (!s) return out;
	for (const [kind, re, pts] of TEXT_SIGNALS) {
		if (re.test(s)) out[kind] = Math.round(pts * weight);
	}
	return out;
}

interface Classified {
	url: string;
	score: number;
	kind: LinkKind;
	text: string;
	order: number;
}

function classify(raw: RawLink, subjectContext: boolean, sender: string | null): Classified | null {
	if (!/^https?:\/\//i.test(raw.url)) return null;
	const url = unwrapRedirects(raw.url);
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return null;
	}
	if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
	const host = u.hostname.toLowerCase();
	const linkDomain = registrableDomain(host);

	// ---- drop boilerplate
	if (APP_STORE_HOSTS.includes(host)) return null;
	if (BOILERPLATE_HOST_RE.test(host)) return null;
	if (IMAGE_PATH_RE.test(u.pathname)) return null;
	if (SOCIAL_DOMAINS.some((d) => hostIs(host, d)) && linkDomain !== sender) return null;
	const words = urlWords(u);
	if (words.some((w) => NEGATIVE_URL_WORDS.has(w)) || NEGATIVE_URL_PHRASES_RE.test(u.pathname + u.search)) return null;
	const label = raw.text || raw.context;
	if (label && NEGATIVE_TEXT_RE.test(label) && !TEXT_SIGNALS.some(([, re]) => re.test(label))) return null;
	const token = hasTokenLike(u);
	const onlyTrackingQuery = [...u.searchParams.keys()].every((k) => /^utm_|^ref_?$|^source$|^campaign$/i.test(k));
	if ((u.pathname === '/' || u.pathname === '') && onlyTrackingQuery && !token) return null;

	// ---- score
	const us = urlSignals(u, words);
	const ts = raw.text ? textSignals(raw.text, 1) : textSignals(raw.context, 0.45);
	const kinds: ActionKind[] = ['reset', 'verify', 'magic'];
	let best = 0;
	for (const k of kinds) best = Math.max(best, us[k] + ts[k]);
	const urlTotal = us.verify + us.magic + us.reset;
	if (urlTotal === 0 && !subjectContext) best *= 0.5; // only the wording says "sign in": need the subject to agree
	if (!token) best *= 0.5; // real action links carry a token
	let score = best + (token ? 10 : 0);
	if (subjectContext && best > 0) score += 5;
	score = Math.round(score);

	// ---- kind: explicit type param > what the anchor/sentence says > what the URL says
	let kind: LinkKind = 'other';
	if (us.explicit) kind = us.explicit;
	else if (ts.reset || ts.verify || ts.magic) kind = ts.reset >= ts.verify && ts.reset >= ts.magic ? 'reset' : ts.verify >= ts.magic ? 'verify' : 'magic';
	else if (us.reset >= 30) kind = 'reset';
	else if (us.magic >= 35) kind = 'magic';
	else if (us.verify > 0) kind = 'verify';
	else if (us.magic >= 20) kind = 'magic';
	else if (us.reset > 0) kind = 'reset';
	if (best === 0) kind = 'other';

	return { url, score, kind, text: raw.text, order: raw.order };
}

export function extractLinks(raws: RawLink[], subject: string, from: string | null | undefined): ScoredLink[] {
	const subjectContext = VERIFY_CONTEXT_RE.test(subject);
	const sender = senderDomain(from);
	const merged = new Map<string, Classified & { seen: number }>();
	for (const raw of raws) {
		const c = classify(raw, subjectContext, sender);
		if (!c) continue;
		const prev = merged.get(c.url);
		if (!prev) {
			merged.set(c.url, { ...c, seen: 1 });
			continue;
		}
		prev.seen++;
		if (c.score > prev.score) {
			prev.score = c.score;
			prev.kind = c.kind;
		}
		if (!prev.text && c.text) prev.text = c.text;
		prev.order = Math.min(prev.order, c.order);
	}
	return [...merged.values()]
		.map((l) => ({ ...l, score: l.score + (l.seen > 1 && l.score > 0 ? 3 : 0) }))
		.filter((l) => l.score >= LINK_MIN_SCORE)
		.sort((a, b) => b.score - a.score || a.order - b.order)
		.slice(0, MAX_LINKS)
		.map((l) => ({ url: l.url, score: l.score, kind: l.kind, text: l.text }));
}
