const CHAT_STYLES = `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  #chat-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.18);
    overflow: hidden;
    border: 1px solid #e0e0e0;
  }
  #chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #1a1a2e;
    color: #fff;
    flex-shrink: 0;
  }
  #chat-header-title {
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.3px;
  }
  #chat-close {
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    font-size: 18px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: 4px;
    opacity: 0.8;
  }
  #chat-close:hover {
    opacity: 1;
    background: rgba(255,255,255,0.15);
  }
  #chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .message {
    max-width: 90%;
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  .message.assistant {
    background: #f0f4ff;
    color: #1a1a2e;
    align-self: flex-start;
    border-bottom-left-radius: 3px;
  }
  .message.user {
    background: #1a1a2e;
    color: #fff;
    align-self: flex-end;
    border-bottom-right-radius: 3px;
  }
  .message.error {
    background: #fff0f0;
    color: #c0392b;
    align-self: flex-start;
    border: 1px solid #f5c6c6;
  }
  .message.loading {
    background: #f0f4ff;
    color: #888;
    align-self: flex-start;
    font-style: italic;
  }
  #chat-input-area {
    display: flex;
    gap: 8px;
    padding: 12px;
    border-top: 1px solid #e8e8e8;
    flex-shrink: 0;
    background: #fafafa;
  }
  #chat-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 13px;
    resize: none;
    outline: none;
    min-height: 36px;
    max-height: 100px;
    overflow-y: auto;
    font-family: inherit;
    line-height: 1.4;
  }
  #chat-input:focus {
    border-color: #1a1a2e;
  }
  #chat-send {
    padding: 8px 14px;
    background: #1a1a2e;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    align-self: flex-end;
    white-space: nowrap;
  }
  #chat-send:hover {
    background: #2d2d4e;
  }
  #chat-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  #chat-header {
    cursor: pointer;
    user-select: none;
  }
  #chat-collapse-icon {
    font-size: 18px;
    opacity: 0.8;
    line-height: 1;
  }
  .message-wrapper {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    align-self: flex-end;
    max-width: 90%;
  }
  .message-wrapper > .message {
    max-width: 100%;
  }
  .message.collapsible {
    max-height: 72px;
    overflow: hidden;
    position: relative;
  }
  .message.user.collapsible::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 32px;
    background: linear-gradient(transparent, #1a1a2e);
    border-radius: 0 0 10px 3px;
  }
  .expand-toggle {
    font-size: 11px;
    color: #aaa;
    cursor: pointer;
    background: none;
    border: none;
    padding: 3px 0;
    font-family: inherit;
    align-self: flex-end;
  }
  .expand-toggle:hover {
    color: #666;
  }
`;

let shadowHost = null;
let shadowRoot = null;
let conversationHistory = [];
let isLoading = false;
let currentModel = null;

const MAX_INPUT_LENGTH = 10_000;

function getPageText() {
  const el =
    document.querySelector("main, article, [role='main'], [role='article']") ||
    document.body;
  return (el.innerText || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 50_000);
}

function buildUserPrompt(selectedText, pageText) {
  return `Page: ${document.title}
URL: ${location.href}

Page content:
${pageText}

Explain in 1-5 sentences: "${selectedText}"`;
}

function openChat(selectedText) {
  currentModel = null;
  if (shadowHost) {
    const message = `Explain: "${selectedText}"`;
    addInitialUserMessage(message);
    conversationHistory.push({ role: "user", content: message });
    shadowHost.style.height = "";
    const icon = shadowRoot.querySelector("#chat-collapse-icon");
    if (icon) icon.textContent = "−";
    sendInitialExplanation();
    return;
  }

  // Capture context BEFORE inserting DOM (insertion causes selection loss)
  const contextText = getPageText();
  const initialUserMessage = buildUserPrompt(selectedText, contextText);
  conversationHistory = [{ role: "user", content: initialUserMessage }];
  initChatUI(initialUserMessage);
}

function initChatUI(initialUserMessage) {
  shadowHost = document.createElement("div");
  shadowHost.id = "ai-explain-host";
  document.body.appendChild(shadowHost);
  shadowRoot = shadowHost.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = CHAT_STYLES;
  shadowRoot.appendChild(style);

  shadowRoot.innerHTML += `
    <div id="chat-container">
      <div id="chat-header">
        <span id="chat-header-title">AI Explain</span>
        <div style="display:flex;align-items:center;gap:8px;">
          <span id="chat-collapse-icon">−</span>
          <button id="chat-close" title="Close">✕</button>
        </div>
      </div>
      <div id="chat-messages"></div>
      <div id="chat-input-area">
        <textarea id="chat-input" placeholder="Ask a follow-up question..." rows="1"></textarea>
        <button id="chat-send">Send</button>
      </div>
    </div>
  `;

  const container = shadowRoot.querySelector("#chat-container");
  container.insertBefore(style, container.firstChild);

  shadowRoot.querySelector("#chat-close").addEventListener("click", (e) => {
    e.stopPropagation();
    closeChat();
  });

  const header = shadowRoot.querySelector("#chat-header");
  const collapseIcon = shadowRoot.querySelector("#chat-collapse-icon");
  let collapsed = false;

  header.addEventListener("click", () => {
    collapsed = !collapsed;
    shadowHost.style.height = collapsed ? "44px" : "";
    collapseIcon.textContent = collapsed ? "+" : "−";
  });

  const input = shadowRoot.querySelector("#chat-input");
  const sendBtn = shadowRoot.querySelector("#chat-send");

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 100) + "px";
  });

  sendBtn.addEventListener("click", sendMessage);

  addInitialUserMessage(initialUserMessage);
  sendInitialExplanation();
}

function closeChat() {
  if (shadowHost) {
    shadowHost.remove();
    shadowHost = null;
    shadowRoot = null;
    conversationHistory = [];
    isLoading = false;
  }
}

function addInitialUserMessage(text) {
  const messages = shadowRoot.querySelector("#chat-messages");

  const wrapper = document.createElement("div");
  wrapper.className = "message-wrapper";

  const div = document.createElement("div");
  div.className = "message user collapsible";
  div.textContent = text;

  const toggle = document.createElement("button");
  toggle.className = "expand-toggle";
  toggle.textContent = "Expand ▼";

  toggle.addEventListener("click", () => {
    const isCollapsed = div.classList.toggle("collapsible");
    toggle.textContent = div.classList.contains("collapsible") ? "Expand ▼" : "Collapse ▲";
  });

  wrapper.appendChild(div);
  wrapper.appendChild(toggle);
  messages.appendChild(wrapper);
}

function addMessage(role, text) {
  const messages = shadowRoot.querySelector("#chat-messages");
  const div = document.createElement("div");
  div.className = `message ${role}`;
  div.textContent = text;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
  return div;
}

function setLoading(loading) {
  isLoading = loading;
  const sendBtn = shadowRoot.querySelector("#chat-send");
  const input = shadowRoot.querySelector("#chat-input");
  if (sendBtn) sendBtn.disabled = loading;
  if (input) input.disabled = loading;
}

async function sendInitialExplanation() {
  const loadingEl = addMessage("loading", "Thinking...");
  setLoading(true);

  try {
    const { passphrase, workerUrl } = await getConfig();
    if (!workerUrl || !passphrase) {
      loadingEl.className = "message error";
      loadingEl.textContent = !workerUrl
        ? "Worker URL not set. Click the extension icon to configure it."
        : "No passphrase set. Click the extension icon to configure it.";
      setLoading(false);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "FETCH_EXPLANATION",
      messages: conversationHistory,
      passphrase,
      ...(currentModel && { model: currentModel }),
    });

    loadingEl.remove();

    if (!response.success) {
      addMessage("error", response.error || "Unknown error occurred.");
      conversationHistory.pop();
    } else {
      addMessage("assistant", response.text);
      conversationHistory.push({ role: "assistant", content: response.text });
    }
  } catch (err) {
    loadingEl.remove();
    addMessage("error", `Error: ${err.message}`);
    conversationHistory.pop();
  }

  setLoading(false);
}

async function sendMessage() {
  if (!shadowRoot || isLoading) return;

  const input = shadowRoot.querySelector("#chat-input");
  const text = input.value.trim();
  if (!text) return;

  if (text.length > MAX_INPUT_LENGTH) {
    addMessage("error", `Message too long (${text.length.toLocaleString()} chars). Max is ${MAX_INPUT_LENGTH.toLocaleString()}.`);
    return;
  }

  input.value = "";
  input.style.height = "auto";

  addMessage("user", text);
  conversationHistory.push({ role: "user", content: text });

  const loadingEl = addMessage("loading", "Thinking...");
  setLoading(true);

  try {
    const { passphrase, workerUrl } = await getConfig();
    if (!workerUrl || !passphrase) {
      loadingEl.className = "message error";
      loadingEl.textContent = !workerUrl
        ? "Worker URL not set. Click the extension icon to configure it."
        : "No passphrase set. Click the extension icon to configure it.";
      setLoading(false);
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: "FETCH_EXPLANATION",
      messages: conversationHistory,
      passphrase,
      ...(currentModel && { model: currentModel }),
    });

    loadingEl.remove();

    if (!response.success) {
      addMessage("error", response.error || "Unknown error occurred.");
      conversationHistory.pop();
    } else {
      addMessage("assistant", response.text);
      conversationHistory.push({ role: "assistant", content: response.text });
    }
  } catch (err) {
    loadingEl.remove();
    addMessage("error", `Error: ${err.message}`);
    conversationHistory.pop();
  }

  setLoading(false);
}

function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["ai-explain-passphrase", "ai-explain-worker-url"], (result) => {
      resolve({
        passphrase: result["ai-explain-passphrase"] || null,
        workerUrl: result["ai-explain-worker-url"] || null,
      });
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "OPEN_CHAT") {
    openChat(message.selectedText || "");
  } else if (message.type === "OPEN_SUMMARISE") {
    openSummarise(message.selectedText || "");
  }
});

function openSummarise(selectedText) {
  currentModel = "gpt-5-mini";
  const message = `Summarise (in 1-5 sentences, avoiding jargon): "${selectedText}"`;
  if (shadowHost) {
    addInitialUserMessage(message);
    conversationHistory.push({ role: "user", content: message });
    shadowHost.style.height = "";
    const icon = shadowRoot.querySelector("#chat-collapse-icon");
    if (icon) icon.textContent = "−";
    sendInitialExplanation();
    return;
  }

  conversationHistory = [{ role: "user", content: message }];
  initChatUI(message);
}
