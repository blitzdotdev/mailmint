import type { Child } from "hono/jsx";
import type { LinkCandidate } from "../extract/index.ts";
import type { InboxRow } from "../store/inboxes.ts";
import { parseJson, type MessageRow, type StoredAttachment } from "../store/messages.ts";
import { CodeChip, Layout, LinkChip, relTime } from "./layout.tsx";

export function MessageView(props: { m: MessageRow; base: string; images: boolean }) {
  const { m, base } = props;
  const codes = parseJson<{ value: string }[]>(m.codes_json, []).map((c) => c.value).filter((c) => c !== m.best_code);
  const links = parseJson<LinkCandidate[]>(m.links_json, []).filter((l) => l.url !== m.best_link).slice(0, 5);
  const attachments = parseJson<StoredAttachment[]>(m.attachments_json, []);
  const hasHtml = m.html_body !== null || m.html_truncated === 1;
  return (
    <div class="viewer">
      <div class="subj" style="font-size:18px;white-space:normal">{m.subject || "(no subject)"}</div>
      <div class="muted small" style="margin:4px 0 14px">
        {m.from_name ? `${m.from_name} <${m.from_address}>` : m.from_address ?? m.envelope_from} → {m.envelope_to}
        {m.tag ? <span> · tag <b class="mono">{m.tag}</b></span> : null} · {relTime(m.received_at)}
      </div>
      {m.best_code ? (
        <div style="margin-bottom:10px">
          <CodeChip code={m.best_code} big />
        </div>
      ) : null}
      {m.best_link ? (
        <div style="margin-bottom:10px">
          <LinkChip url={m.best_link} />
        </div>
      ) : null}
      {codes.length ? <div class="small muted">Other codes: <span class="mono">{codes.join(", ")}</span></div> : null}
      {links.length ? (
        <details class="small" style="margin:6px 0">
          <summary class="muted">Other links ({links.length})</summary>
          {links.map((l) => (
            <div class="mono" style="overflow-wrap:anywhere">
              <a href={l.url} target="_blank" rel="noopener noreferrer">{l.text || l.url}</a> <span class="muted">({l.kind})</span>
            </div>
          ))}
        </details>
      ) : null}
      <div class="row small" style="margin:14px 0 10px">
        {hasHtml ? (
          props.images ? <a href={`?m=${m.id}`}>Hide remote images</a> : <a href={`?m=${m.id}&images=1`}>Load remote images</a>
        ) : null}
        <a href={`${base}/raw`}>Download .eml</a>
        {attachments.map((a, i) => (
          <a href={`${base}/attachments/${i}`}>Attachment: {a.filename ?? `attachment-${i}`} ({Math.ceil(a.size / 1024)} KB)</a>
        ))}
      </div>
      {hasHtml ? (
        <iframe
          src={`${base}/html${props.images ? "?images=1" : ""}`}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          referrerpolicy="no-referrer"
          title="Message HTML"
        ></iframe>
      ) : (
        <pre>{m.text_body ?? ""}</pre>
      )}
      {hasHtml && m.text_body ? (
        <details style="margin-top:10px">
          <summary class="small muted">Plain text</summary>
          <pre>{m.text_body}</pre>
        </details>
      ) : null}
    </div>
  );
}

export function InboxView(props: {
  inbox: InboxRow;
  messages: MessageRow[];
  selected: MessageRow | null;
  messageBase: (id: number) => string;
  waitUrl: string;
  images: boolean;
  header?: Child;
}) {
  const { inbox, messages, selected } = props;
  return (
    <>
      <div class="row" style="justify-content:space-between">
        <div>
          <h1 class="mono">
            {inbox.address}{" "}
            <button type="button" class="ghost small" data-copy={inbox.address}>copy</button>
          </h1>
          <div class="muted small">
            {inbox.label ? <b>{inbox.label} · </b> : null}
            {inbox.origin === "auto" ? "catch-all inbox" : "inbox"} · {inbox.message_count} messages · expires{" "}
            {relTime(inbox.expires_at)}
          </div>
        </div>
        <span class="live" data-wait={props.waitUrl}>waiting for mail</span>
      </div>
      {props.header}
      {messages.length === 0 ? (
        <div class="panel empty" style="margin-top:16px">
          No mail yet. Send something to <b class="mono">{inbox.address}</b>; it shows up here instantly.
        </div>
      ) : (
        <div class="split" style="margin-top:16px">
          <div class="panel msglist">
            {messages.map((m) => (
              <a href={`?m=${m.id}`} class={selected?.id === m.id ? "sel" : ""}>
                <div class="row" style="justify-content:space-between;gap:6px">
                  <span class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">
                    {m.from_name || m.from_address || m.envelope_from}
                  </span>
                  <span class="small muted">{relTime(m.received_at)}</span>
                </div>
                <div class="subj">{m.subject || "(no subject)"}</div>
                <div class="row small" style="gap:6px;margin-top:2px">
                  {m.best_code ? <span class="chip" style="padding:0 6px">{m.best_code}</span> : null}
                  {m.best_link ? <span class="muted">link ↗</span> : null}
                  {m.tag ? <span class="muted mono">+{m.tag}</span> : null}
                </div>
              </a>
            ))}
          </div>
          <div class="panel">
            {selected ? (
              <MessageView m={selected} base={props.messageBase(selected.id)} images={props.images} />
            ) : (
              <div class="empty">Select a message</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function LandingPage(props: { origin: string; domain: string }) {
  return (
    <Layout title="Disposable inboxes">
      <h1>Disposable inboxes for sign-up testing</h1>
      <p class="muted">
        Private, self-hosted throwaway email on Cloudflare. Mail to any <b class="mono">name@{props.domain}</b> is
        accepted; codes and verification links are extracted automatically.
      </p>
      <div class="panel" style="padding:18px;margin-top:18px">
        <pre style="margin:0">{`npx burnermail login --url ${props.origin} --key <api key>
addr=$(npx burnermail new)
code=$(npx burnermail wait "$addr" --code)`}</pre>
      </div>
      <p class="small muted" style="margin-top:18px">
        Agents: read <a href="/agents.md">/agents.md</a>. Owner: <a href="/admin">/admin</a>.
      </p>
    </Layout>
  );
}

export function CapabilityPage(props: {
  inbox: InboxRow;
  messages: MessageRow[];
  selected: MessageRow | null;
  token: string;
  images: boolean;
}) {
  const base = `/i/${props.token}`;
  const maxId = props.messages[0]?.id ?? 0;
  return (
    <Layout title={props.inbox.address}>
      <InboxView
        inbox={props.inbox}
        messages={props.messages}
        selected={props.selected}
        messageBase={(id) => `${base}/messages/${id}`}
        waitUrl={`${base}/wait?since=${maxId}&timeout=55`}
        images={props.images}
        header={
          <p class="small muted">
            This page's URL is the key to this inbox. Agents: <a href={`${base}/agents.md`}>agents.md</a>.
          </p>
        }
      />
    </Layout>
  );
}
