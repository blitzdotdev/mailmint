import type { Child } from "hono/jsx";
import type { LinkCandidate } from "../extract/index.ts";
import type { InboxRow } from "../store/inboxes.ts";
import { parseJson, type MessageRow, type StoredAttachment } from "../store/messages.ts";
import { BrandMark, CodeBadge, CopyButton, EmptyState, Icon, Layout, LiveBadge, relTime } from "./layout.tsx";

function sender(m: MessageRow): string {
  return m.from_name || m.from_address || m.envelope_from || "unknown sender";
}

/** One row in a message list (mailroom's thread row). `to` shows the address, for lists across inboxes. */
export function MessageItem(props: { m: MessageRow; href: string; current: boolean; to?: string }) {
  const { m } = props;
  const attachments = parseJson<StoredAttachment[]>(m.attachments_json, []).length;
  return (
    <a class="item" href={props.href} aria-current={props.current ? "true" : undefined}>
      <span class="item-top">
        <span class="item-from truncate">{sender(m)}</span>
        <span class="item-time">{relTime(m.received_at)}</span>
      </span>
      <span class="item-subj truncate">{m.subject || "(no subject)"}</span>
      {props.to ? <span class="item-to truncate">{props.to}</span> : null}
      {m.best_code || m.best_link || m.tag || attachments ? (
        <span class="item-tags">
          {m.best_code ? <CodeBadge code={m.best_code} /> : null}
          {m.best_link ? (
            <span class="xs">
              <Icon name="link" size="xs" />
              verification link
            </span>
          ) : null}
          {m.tag ? <span class="badge outline">+{m.tag}</span> : null}
          {attachments ? (
            <span class="xs">
              <Icon name="paperclip" size="xs" />
              {attachments}
            </span>
          ) : null}
        </span>
      ) : null}
    </a>
  );
}

/** The reading pane for one message. `back`: the list URL (phones show one pane at a time). */
export function MessageReader(props: { m: MessageRow; base: string; images: boolean; back: string; selfUrl: string }) {
  const { m, base } = props;
  const codes = parseJson<{ value: string }[]>(m.codes_json, []).map((c) => c.value).filter((c) => c !== m.best_code);
  const links = parseJson<LinkCandidate[]>(m.links_json, []).filter((l) => l.url !== m.best_link).slice(0, 5);
  const attachments = parseJson<StoredAttachment[]>(m.attachments_json, []);
  const hasHtml = m.html_body !== null || m.html_truncated === 1;
  const join = props.selfUrl.includes("?") ? "&" : "?";
  return (
    <section class="reader" aria-label="Message">
      <header class="reader-head">
        <a class="btn ghost icon back-link" href={props.back} aria-label="Back to the list">
          <Icon name="back" />
        </a>
        <div class="grow">
          <h2 class="truncate">{m.subject || "(no subject)"}</h2>
          <div class="reader-meta">
            <span class="truncate" style="color:var(--foreground)">
              {m.from_name ? `${m.from_name} <${m.from_address}>` : m.from_address ?? m.envelope_from}
            </span>
          </div>
          <div class="reader-meta">
            <span>to</span>
            <span class="mono truncate">{m.envelope_to}</span>
            <span aria-hidden="true">·</span>
            <span class="tnum">{relTime(m.received_at)}</span>
            {m.tag ? <span class="badge outline">tag {m.tag}</span> : null}
          </div>
        </div>
        <a class="btn outline sm" href={`${base}/raw`} title="Download the raw message">
          <Icon name="download" size="sm" />
          .eml
        </a>
      </header>
      <div class="reader-body">
        <div class="reader-inner">
          {m.best_code || m.best_link ? (
            <div class="extract">
              {m.best_code ? (
                <div>
                  <span class="extract-label">
                    <Icon name="hash" size="xs" />
                    Code
                  </span>
                  <span class="code-value grow">{m.best_code}</span>
                  <CopyButton value={m.best_code} label="Copy" />
                </div>
              ) : null}
              {m.best_link ? (
                <div>
                  <span class="extract-label">
                    <Icon name="link" size="xs" />
                    Verification link
                  </span>
                  <a class="link-value truncate grow" href={m.best_link} target="_blank" rel="noopener noreferrer">
                    {m.best_link}
                  </a>
                  <a class="btn outline sm icon" href={m.best_link} target="_blank" rel="noopener noreferrer" title="Open" aria-label="Open">
                    <Icon name="external" size="sm" />
                  </a>
                  <CopyButton value={m.best_link} />
                </div>
              ) : null}
            </div>
          ) : null}
          {codes.length || links.length ? (
            <details class="more">
              <summary>
                Other candidates ({codes.length + links.length})
              </summary>
              <div class="more-list">
                {codes.length ? (
                  <div>
                    <span class="muted">Codes: </span>
                    <span class="mono">{codes.join(", ")}</span>
                  </div>
                ) : null}
                {links.map((l) => (
                  <div class="hstack" style="align-items:baseline">
                    <a href={l.url} target="_blank" rel="noopener noreferrer">{l.text || l.url}</a>
                    <span class="muted xs">{l.kind}</span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
          {hasHtml || attachments.length ? (
            <div class="toolbar">
              {hasHtml ? (
                <a class="btn ghost xs muted-text" href={props.images ? props.selfUrl : `${props.selfUrl}${join}images=1`}>
                  <Icon name="image" size="xs" />
                  {props.images ? "Hide remote images" : "Load remote images"}
                </a>
              ) : null}
              {attachments.map((a, i) => (
                <a class="btn outline xs" href={`${base}/attachments/${i}`}>
                  <Icon name="paperclip" size="xs" />
                  {a.filename ?? `attachment-${i}`}
                  <span class="muted">{Math.ceil(a.size / 1024)} KB</span>
                </a>
              ))}
            </div>
          ) : null}
          <div class="mail-frame">
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
          </div>
          {hasHtml && m.text_body ? (
            <details class="more">
              <summary>Plain text</summary>
              <pre>{m.text_body}</pre>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * List + reader for one inbox (owner view and share link). `head` fills the list header.
 * `explicit`: a message was picked (?m=…), so phones show the reader instead of the list.
 */
export function InboxPanes(props: {
  inbox: InboxRow;
  messages: MessageRow[];
  selected: MessageRow | null;
  explicit: boolean;
  listUrl: string;
  messageBase: (id: number) => string;
  images: boolean;
  head: Child;
}) {
  const { inbox, messages, selected } = props;
  const href = (id: number) => `${props.listUrl}?m=${id}`;
  return (
    <main class="main" data-view={props.explicit && selected ? "reader" : "list"}>
      <section class="list" aria-label="Messages">
        <div class="list-head">{props.head}</div>
        <div class="list-body">
          {messages.length === 0 ? (
            <div class="list-empty">No mail yet.</div>
          ) : (
            messages.map((m) => <MessageItem m={m} href={href(m.id)} current={selected?.id === m.id} />)
          )}
        </div>
      </section>
      {selected ? (
        <MessageReader
          m={selected}
          base={props.messageBase(selected.id)}
          images={props.images}
          back={props.listUrl}
          selfUrl={href(selected.id)}
        />
      ) : (
        <section class="reader">
          <EmptyState icon="inbox" title={messages.length ? "Select a message" : "Waiting for mail"}>
            {messages.length ? null : (
              <>
                Send anything to <span class="mono">{inbox.address}</span>. It shows up here the moment it lands, with
                the code and link pulled out.
              </>
            )}
          </EmptyState>
        </section>
      )}
    </main>
  );
}

/** Header block for an inbox's message list: address, copy, live state, meta, optional actions. */
export function InboxHead(props: { inbox: InboxRow; waitUrl: string; nextUrl?: string; actions?: Child; note?: Child }) {
  const { inbox } = props;
  return (
    <>
      <div class="list-title">
        <h1 class="mono truncate grow" style="font-size:14px" title={inbox.address}>
          {inbox.address}
        </h1>
        <CopyButton value={inbox.address} size="xs" variant="ghost" title="Copy address" />
        <LiveBadge url={props.waitUrl} next={props.nextUrl} label="Live" />
      </div>
      {inbox.label ? <p class="truncate" style="font-size:13px;font-weight:500;margin-top:-4px">{inbox.label}</p> : null}
      <div class="list-meta">
        <span>{inbox.origin === "auto" ? "Catch-all" : "Created"}</span>
        <span aria-hidden="true">·</span>
        <span class="tnum">{inbox.message_count} {inbox.message_count === 1 ? "message" : "messages"}</span>
        <span aria-hidden="true">·</span>
        <span class="hstack" style="gap:4px">
          <Icon name="clock" size="xs" />
          expires {relTime(inbox.expires_at)}
        </span>
      </div>
      {props.note}
      {props.actions}
    </>
  );
}

export function CapabilityPage(props: {
  inbox: InboxRow;
  messages: MessageRow[];
  selected: MessageRow | null;
  explicit: boolean;
  token: string;
  images: boolean;
}) {
  const base = `/i/${props.token}`;
  const maxId = props.messages[0]?.id ?? 0;
  return (
    <Layout title={props.inbox.address}>
      <div class="share-shell">
        <header class="share-bar">
          <span class="brand">
            <BrandMark />
            mailmint
          </span>
          <span class="badge secondary">
            <Icon name="share" size="xs" />
            Shared inbox
          </span>
          <a class="btn ghost sm muted-text" href={`${base}/agents.md`} style="margin-left:auto">
            <Icon name="book" size="sm" />
            agents.md
          </a>
        </header>
        <InboxPanes
          inbox={props.inbox}
          messages={props.messages}
          selected={props.selected}
          explicit={props.explicit}
          listUrl={base}
          messageBase={(id) => `${base}/messages/${id}`}
          images={props.images}
          head={
            <InboxHead
              inbox={props.inbox}
              waitUrl={`${base}/wait?since=${maxId}&timeout=55`}
              note={<p class="xs muted">This page's URL is the key to this inbox: anyone with it can read the mail.</p>}
            />
          }
        />
      </div>
    </Layout>
  );
}
