# AI Explain

AI Explain is a simple Chrome extension that allows the user to ask an LLM to explain something on the webpage. They can highlight text and then right click it, and an option "AI Explain" appears in the right click menu. Pressing that brings up a little chat window with the AI in the bottom right hand corner where an OpenAI LLM has been prompted to explain this sentence. The context of the sentence is also included.

Stack:
- Backend is a cloudflare worker.
- Backend will only respond if a passphrase is also sent as request.headers.get("X-Passphrase").
- Frontend is a chrome extension.
- If not already set the chrome extension will show an input text box where they
  can input the passphrase. This can be stored as plain text.
- OPENAI_API_KEY should be loaded from root level .env
- This readme is in the top-level folder /ai-explain, there should be children
  /worker and /chrome-ext
# ai-explain
