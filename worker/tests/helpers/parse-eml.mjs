// Test-only helper: turn a raw RFC 822 message into the ExtractInput shape.
// Uses postal-mime, the same parser the Worker uses at ingest, so fixtures are
// decoded exactly as production mail is (folding, RFC 2047 words, nested
// multipart, quoted-printable, base64, charsets).
import PostalMime from 'postal-mime';

/**
 * @param {string | Uint8Array | ArrayBuffer} raw
 * @returns {Promise<{subject: string, text: string | null, html: string | null, from: string | null}>}
 */
export async function parseEml(raw) {
	const email = await PostalMime.parse(raw);
	const from = email.from
		? (email.from.name ? `${email.from.name} <${email.from.address ?? ''}>` : (email.from.address ?? null))
		: null;
	return {
		subject: email.subject ?? '',
		text: email.text ?? null,
		html: email.html ?? null,
		from,
	};
}
