// Browser scripts bundled into the Worker as text (wrangler.jsonc `rules`) and served from /assets/.
declare module "*.client.js" {
  const source: string;
  export default source;
}

// Fonts bundled as bytes (wrangler.jsonc `rules`, type Data) and served from /assets/fonts/.
declare module "*.woff2" {
  const bytes: ArrayBuffer;
  export default bytes;
}
