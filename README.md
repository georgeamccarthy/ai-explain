# AI Explain

A Chrome extension that lets you highlight any text on a webpage, right-click, and select **AI Explain** to open a chat window powered by an OpenAI LLM. The full page text is sent as context so the model can give accurate, relevant explanations regardless of site structure.

## Features

- Highlight text → right-click → **AI Explain** opens a chat panel in the bottom-right corner
- Full page text (up to 50,000 chars) is sent as context on the first request, using semantic content containers (`<main>`, `<article>`) before falling back to `<body>`
- Subsequent explain requests on the same page continue the existing conversation — no context is lost
- Chat panel is collapsible (click the header bar) and closeable (✕)
- Each initial user message is shown collapsed in the chat with an **Expand** toggle
- Follow-up questions can be typed directly in the chat input
- System prompt guides the model to be concise, structured, and honest about uncertainty

## Stack

- **Frontend:** Chrome extension (`chrome-ext/`)
- **Backend:** Cloudflare Worker (`worker/`)
  - Requires a passphrase sent as `X-Passphrase` request header — requests without it are rejected
  - Prepends a system prompt server-side on every request
  - Accepts messages up to 100,000 chars to accommodate full page context

## Setup

### Worker

```bash
cd worker
npm install
```

Set secrets via Wrangler:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put PASSPHRASE
```

Deploy:

```bash
npx wrangler deploy
```

### Chrome extension

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `chrome-ext/` folder
4. Click the extension icon and enter your Worker URL and passphrase

## Project structure

```
ai-explain/
├── chrome-ext/      # Chrome extension (content script, popup, background)
└── worker/          # Cloudflare Worker (TypeScript)
```
