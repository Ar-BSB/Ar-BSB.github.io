// La Recetera — Cloudflare Worker proxy.
//
// Purpose: the Groq key lives here, as an encrypted Worker secret, so the
// published site never ships it. The browser calls this Worker; this Worker
// calls Groq.
//
// Deploy (free tier is plenty):
//   npm install -g wrangler
//   wrangler login
//   wrangler deploy
//   wrangler secret put GROQ_API_KEY      <- paste the key when prompted
// Then copy the printed https://...workers.dev URL into config.js as proxyUrl.
//
// Edit ALLOWED_ORIGINS to your own GitHub Pages origin before deploying.

const ALLOWED_ORIGINS = [
  "https://YOUR-USERNAME.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
];

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// Hard limits so a scraped Worker URL can't be turned into free unlimited
// inference against your account.
const ALLOWED_MODEL = "openai/gpt-oss-120b";
const MAX_TOKENS_CAP = 1500;
const MAX_MESSAGES = 40;
const MAX_CHARS = 24000;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return json({ error: { message: "Method not allowed." } }, 405, origin);
    }
    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: { message: "Origin not allowed." } }, 403, origin);
    }
    if (!env.GROQ_API_KEY) {
      return json({ error: { message: "Proxy is missing GROQ_API_KEY." } }, 500, origin);
    }

    let incoming;
    try {
      incoming = await request.json();
    } catch (e) {
      return json({ error: { message: "Invalid JSON body." } }, 400, origin);
    }

    const messages = Array.isArray(incoming.messages) ? incoming.messages : null;
    if (!messages || messages.length === 0) {
      return json({ error: { message: "Missing messages." } }, 400, origin);
    }
    if (messages.length > MAX_MESSAGES) {
      return json({ error: { message: "Too many messages." } }, 400, origin);
    }

    let total = 0;
    for (const m of messages) {
      if (!m || typeof m.content !== "string" || typeof m.role !== "string") {
        return json({ error: { message: "Malformed message." } }, 400, origin);
      }
      total += m.content.length;
    }
    if (total > MAX_CHARS) {
      return json({ error: { message: "Conversation too long." } }, 400, origin);
    }

    // Rebuild the payload from scratch: only these fields reach Groq.
    const payload = {
      model: ALLOWED_MODEL,
      messages,
      max_tokens: Math.min(Number(incoming.max_tokens) || 1200, MAX_TOKENS_CAP),
      temperature: Math.min(Math.max(Number(incoming.temperature) || 0.7, 0), 1.2),
      response_format: { type: "json_object" },
    };

    let upstream;
    try {
      upstream = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GROQ_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return json({ error: { message: "Upstream unreachable." } }, 502, origin);
    }

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  },
};
