chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ai-explain",
    title: "AI Explain",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "ai-explain" || !tab?.id) return;

  chrome.tabs.sendMessage(tab.id, {
    type: "OPEN_CHAT",
    selectedText: info.selectionText || "",
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "FETCH_EXPLANATION") return false;

  fetchFromWorker(message.messages, message.passphrase)
    .then((text) => sendResponse({ success: true, text }))
    .catch((err) => sendResponse({ success: false, error: err.message }));

  return true; // keep channel open for async response
});

async function fetchFromWorker(messages, passphrase) {
  const { "ai-explain-worker-url": workerUrl } = await chrome.storage.local.get("ai-explain-worker-url");
  if (!workerUrl) throw new Error("Worker URL not set. Configure it in the extension popup.");

  let response;
  try {
    response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Passphrase": passphrase,
      },
      body: JSON.stringify({ messages }),
    });
  } catch (err) {
    throw new Error(
      `Network error reaching worker at ${workerUrl} — ${err.message}. ` +
      `Check the URL is correct and the worker is deployed.`
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid passphrase. Update it in the extension popup.");
    }
    let body = "";
    try { body = await response.text(); } catch { /* ignore */ }
    throw new Error(`Worker returned ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) fullText += delta;
      } catch {
        // skip malformed SSE lines
      }
    }
  }

  return fullText;
}
