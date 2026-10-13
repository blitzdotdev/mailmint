// "Connect an AI chat" on /admin/connect: this page becomes an agent-socket app whose tools
// call the owner API (/admin/api, authorized by the Access session). The link works while the
// tab is open; the relay holds the session through reconnects, and a reload resumes it.
import { connect } from "/assets/agent-socket-sdk.js";
import { APP_ID, agentsMd, buildTools, fetchApi } from "/assets/socket-tools.js";

const root = document.querySelector("[data-socket]");
const relay = root.dataset.relay;
const STORE = "mailmint.agent-socket";
const $ = (sel) => root.querySelector(sel);
let session = null;

function show(state, text) {
  $("[data-status]").textContent = text;
  root.dataset.state = state;
  $("[data-start]").hidden = state === "live" || state === "connecting";
  $("[data-stop]").hidden = state !== "live";
}

function showLink(url) {
  $("[data-link]").textContent = url;
  $("[data-copy-link]").setAttribute("data-copy", url);
  $("[data-link-row]").hidden = !url;
}

function logCall(path, status) {
  const li = document.createElement("li");
  li.textContent = `${new Date().toLocaleTimeString()}  ${path}${status >= 400 ? `  → ${status}` : ""}`;
  $("[data-log]").prepend(li);
  while ($("[data-log]").children.length > 50) $("[data-log]").lastChild.remove();
}

function saved() {
  try {
    return JSON.parse(sessionStorage.getItem(STORE) || "null");
  } catch {
    return null;
  }
}

async function start() {
  show("connecting", "Connecting to agent-socket…");
  const prior = saved();
  const tools = buildTools(fetchApi("/admin/api")).map((tool) => ({
    ...tool,
    handler: async (ctx) => {
      const result = await tool.handler(ctx);
      logCall(tool.path, result?.status ?? 200);
      return result;
    },
  }));
  try {
    session = await connect({
      baseUrl: relay,
      appId: APP_ID,
      appDescription: "Disposable inboxes: create an address, wait for the verification code or link.",
      agentsMd: agentsMd(location.origin),
      tools,
      ...(prior ? { resume: { sessionId: prior.sessionId, secret: prior.secret } } : {}),
      onDisconnect: () => show("connecting", "Reconnecting… (the link keeps working once back)"),
      onReconnect: () => show("live", "Live: the AI chat can use mailmint while this tab is open."),
      onSessionChanged: ({ tokensRemapped }) => {
        const next = Object.values(tokensRemapped ?? {})[0];
        if (next) remember(next);
      },
    });
  } catch (error) {
    show("off", `Could not reach ${relay}: ${error.message}`);
    return;
  }
  const url =
    prior && prior.sessionId === session.sessionId && prior.url
      ? prior.url
      : (await session.mintAgentToken({ label: "mailmint-dashboard" })).url;
  remember(url);
  show("live", "Live: the AI chat can use mailmint while this tab is open.");
}

function remember(url) {
  sessionStorage.setItem(STORE, JSON.stringify({ sessionId: session.sessionId, secret: session.resumeSecret, url }));
  showLink(url);
}

function stop() {
  session?.close();
  session = null;
  sessionStorage.removeItem(STORE);
  showLink("");
  show("off", "Stopped. The link no longer works.");
}

$("[data-start]").addEventListener("click", start);
$("[data-stop]").addEventListener("click", stop);
if (saved()) start();
else show("off", "Not connected.");
