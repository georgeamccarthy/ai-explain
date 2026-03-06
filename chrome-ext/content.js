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
`;

let shadowHost = null;
let shadowRoot = null;
let conversationHistory = [];
let isLoading = false;

const MAX_INPUT_LENGTH = 10_000;

function getPageContext() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return "";

  try {
    const range = selection.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;

    const blockTags = new Set(["P", "DIV", "ARTICLE", "SECTION", "MAIN", "BLOCKQUOTE", "LI", "TD", "TH"]);
    while (node && node !== document.body) {
      if (blockTags.has(node.tagName)) {
        return (node.innerText || "").trim().slice(0, 2000);
      }
      node = node.parentElement;
    }
  } catch {
    // fallback below
  }

  return (document.body?.innerText || "").trim().slice(0, 2000);
}

function buildUserPrompt(selectedText, contextText) {
  return `${document.title}
${location.href}
${contextText}

Explain: "${selectedText}"`;
}

function openChat(selectedText) {
  // Capture context BEFORE inserting DOM (insertion causes selection loss)
  const contextText = getPageContext();
  const initialUserMessage = buildUserPrompt(selectedText, contextText);
  conversationHistory = [{ role: "user", content: initialUserMessage }];

  if (shadowHost) {
    shadowHost.remove();
    shadowHost = null;
    shadowRoot = null;
  }

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
        <button id="chat-close" title="Close">✕</button>
      </div>
      <div id="chat-messages"></div>
      <div id="chat-input-area">
        <textarea id="chat-input" placeholder="Ask a follow-up question..." rows="1"></textarea>
        <button id="chat-send">Send</button>
      </div>
    </div>
  `;

  // Re-append style after innerHTML overwrite
  const container = shadowRoot.querySelector("#chat-container");
  container.insertBefore(style, container.firstChild);

  shadowRoot.querySelector("#chat-close").addEventListener("click", closeChat);

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

  // Initial explanation
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
  }
});
