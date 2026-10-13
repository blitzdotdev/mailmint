interface Env {
  EMAIL: {
    send(message: {
      from: string | { email: string; name?: string };
      to: string;
      subject: string;
      text?: string;
      html?: string;
      headers?: Record<string, string>;
      attachments?: { content: ArrayBuffer; filename: string; type: string; disposition: "attachment" | "inline" }[];
    }): Promise<{ messageId: string }>;
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
    const body = (await request.json()) as {
      to?: string;
      subject?: string;
      text?: string;
      html?: string;
      from_name?: string;
      headers?: Record<string, string>;
      attachments?: { filename: string; type: string; content_base64: string }[];
    };
    const to = String(body.to ?? "").toLowerCase();
    if (!to.endsWith(`@${env.ALLOWED_DOMAIN}`) || to.split("@").length !== 2) {
      return new Response(`only *@${env.ALLOWED_DOMAIN}`, { status: 400 });
    }
    const attachments = (body.attachments ?? []).slice(0, 5).map((a) => ({
      content: Uint8Array.from(atob(a.content_base64), (c) => c.charCodeAt(0)).buffer,
      filename: a.filename,
      type: a.type,
      disposition: "attachment" as const,
    }));
    const { messageId } = await env.EMAIL.send({
      from: body.from_name ? { email: env.FROM, name: body.from_name } : env.FROM,
      to,
      subject: String(body.subject ?? "mailmint smoke"),
      text: body.text,
      html: body.html,
      ...(body.headers ? { headers: body.headers } : {}),
      ...(attachments.length ? { attachments } : {}),
    });
    return Response.json({ messageId });
  },
};
