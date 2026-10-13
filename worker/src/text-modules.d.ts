// Browser scripts bundled into the Worker as text (wrangler.jsonc `rules`) and served from /assets/.
declare module "*.client.js" {
  const source: string;
  export default source;
}
