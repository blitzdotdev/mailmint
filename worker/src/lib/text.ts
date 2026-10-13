const encoder = new TextEncoder();

export function utf8Length(s: string): number {
  return encoder.encode(s).byteLength;
}

/** Truncate to at most `max` UTF-8 bytes without splitting a character. */
export function fitBytes(s: string, max: number): string {
  if (s.length <= max / 3 || utf8Length(s) <= max) return s;
  // A cut multi-byte character decodes to U+FFFD at the end; drop it.
  return new TextDecoder().decode(encoder.encode(s).subarray(0, max)).replace(/\uFFFD$/, "");
}

/** Header-safe ASCII (attachment names and types come from the sender). */
export function asciiHeader(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_").slice(0, 200);
}

/** RFC 6266 attachment disposition with an ASCII fallback and the UTF-8 name. */
export function contentDisposition(filename: string): string {
  const name = filename.slice(0, 200);
  return `attachment; filename="${asciiHeader(name)}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
