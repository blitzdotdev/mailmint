interface Env {
  EMAIL: {
    send(message: { from: string; to: string; subject: string; text?: string; html?: string }): Promise<{ messageId: string }>;
  };
  FROM: string;
  ALLOWED_DOMAIN: string;
  SMOKE_SECRET: string;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") return new Response("POST only", { status: 405 });
    if (!env.SMOKE_SECRET || !safeEqual(request.headers.get("x-smoke-secret") ?? "", env.SMOKE_SECRET)) {
      return new Response("forbidden", { status: 403 });
    }
    const body = (await request.json()) as { to?: string; subject?: string; text?: string; html?: string };
    const to = String(body.to ?? "").toLowerCase();
    if (!to.endsWith(`@${env.ALLOWED_DOMAIN}`) || to.split("@").length !== 2) {
      return new Response(`only *@${env.ALLOWED_DOMAIN}`, { status: 400 });
    }
    const { messageId } = await env.EMAIL.send({
      from: env.FROM,
      to,
      subject: String(body.subject ?? "mailmint smoke"),
      text: body.text,
      html: body.html,
    });
    return Response.json({ messageId });
  },
};
