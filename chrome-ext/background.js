chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "ai-explain",
    title: "AI Explain",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "ai-summarise",
    title: "AI Summarise",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === "ai-explain") {
    chrome.tabs.sendMessage(tab.id, {
      type: "OPEN_CHAT",
      selectedText: info.selectionText || "",
    });
  } else if (info.menuItemId === "ai-summarise") {
    chrome.tabs.sendMessage(tab.id, {
      type: "OPEN_SUMMARISE",
      selectedText: info.selectionText || "",
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PDF_TEXT") {
    const tabId = sender.tab?.id;
    if (!tabId) { sendResponse({ text: '' }); return true; }
    extractPdfTextViaTab(tabId, message.url)
      .then(text => sendResponse({ text }))
      .catch(() => sendResponse({ text: '' }));
    return true;
  }

  if (message.type !== "FETCH_EXPLANATION") return false;

  fetchFromWorker(message.messages, message.passphrase, message.model)
    .then((text) => sendResponse({ success: true, text }))
    .catch((err) => sendResponse({ success: false, error: err.message }));

  return true; // keep channel open for async response
});

async function extractPdfTextViaTab(tabId, url) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['lib/pdf.min.js'],
  });

  const workerSrc = chrome.runtime.getURL('lib/pdf.worker.min.js');
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (pdfUrl, workerSrc) => {
      try {
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const pageTexts = [];
        for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          pageTexts.push(content.items.map(item => item.str).join(' '));
        }
        return pageTexts.join('\n\n').trim().slice(0, 50_000);
      } catch (e) {
        return '';
      }
    },
    args: [url, workerSrc],
  });

  return results[0]?.result || '';
}

async function fetchFromWorker(messages, passphrase, model) {
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
      body: JSON.stringify({ messages, ...(model && { model }) }),
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
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // retain incomplete trailing line for next chunk

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
