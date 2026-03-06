export interface Env {
  OPENAI_API_KEY: string;
  PASSPHRASE: string;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

const MODEL = "gpt-5.2";
const ALLOWED_MODELS = new Set(["gpt-5.2", "gpt-5-mini"]);
const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 100_000;

const SYSTEM_PROMPT = `You are ChatGPT, a helpful, knowledgeable, and polite AI assistant.

Guidelines:
- Give clear, accurate, and helpful answers.
- If the question is unclear, ask clarifying questions.
- Prefer concise answers but expand when useful.
- Use structured formatting (lists, steps, headings) when helpful.
- Provide examples when explaining complex topics.
- Admit uncertainty instead of guessing.
- Maintain context from the conversation.

Tone:
- Friendly, conversational, and professional.
- Avoid unnecessary verbosity.`;

interface ChatRequest {
  messages: Message[];
  model?: string;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Passphrase",
};

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin && origin.startsWith("chrome-extension://")) {
    return {
      ...CORS_HEADERS,
      "Access-Control-Allow-Origin": origin,
    };
  }
  return CORS_HEADERS;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    const url = new URL(request.url);
    if (request.method !== "POST") {
      return new Response("Not Found", { status: 404, headers });
    }

    const passphrase = request.headers.get("X-Passphrase");
    if (!passphrase || passphrase !== env.PASSPHRASE) {
      return new Response("Unauthorized", { status: 401, headers });
    }

    let body: ChatRequest;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad Request", { status: 400, headers });
    }

    const { messages, model: requestedModel } = body;
    const model = requestedModel && ALLOWED_MODELS.has(requestedModel) ? requestedModel : MODEL;

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("Bad Request: messages required", { status: 400, headers });
    }

    if (messages.length > MAX_MESSAGES) {
      return new Response(`Bad Request: max ${MAX_MESSAGES} messages`, { status: 400, headers });
    }

    const validRoles = new Set(["system", "user", "assistant"]);
    for (const msg of messages) {
      if (!msg || typeof msg !== "object") {
        return new Response("Bad Request: invalid message", { status: 400, headers });
      }
      if (!validRoles.has(msg.role) || typeof msg.content !== "string") {
        return new Response("Bad Request: invalid message role or content", { status: 400, headers });
      }
      if (msg.content.length > MAX_MESSAGE_LENGTH) {
        return new Response(`Bad Request: message exceeds ${MAX_MESSAGE_LENGTH} chars`, { status: 400, headers });
      }
    }

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        stream: true,
      }),
    });

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      console.error(`OpenAI error [${openaiResponse.status}]:`, errorBody);
      return new Response(`OpenAI ${openaiResponse.status}: ${errorBody}`, { status: openaiResponse.status, headers });
    }

    return new Response(openaiResponse.body, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  },
};
