// Capability tokens and API keys. Only SHA-256 digests are stored; the raw
// value is shown once. 24 random bytes = 192 bits.

export const INBOX_TOKEN_PREFIX = "mm_in_";
export const API_KEY_PREFIX = "mm_key_";

export function randomBase64Url(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  let binary = "";
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function newInboxToken(): string {
  return INBOX_TOKEN_PREFIX + randomBase64Url(24);
}

export function newApiKey(): string {
  return API_KEY_PREFIX + randomBase64Url(24);
}

const TOKEN_SHAPE = /^mm_(in|key)_[A-Za-z0-9_-]{32}$/;

export function looksLikeToken(value: string): boolean {
  return TOKEN_SHAPE.test(value);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
