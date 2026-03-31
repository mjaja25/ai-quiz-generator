const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_PROMPT_LENGTH = 8000;
const MAX_QUESTIONS = 20;
const API_TIMEOUT_MS = 25000;

const ALLOWED_ORIGINS = [
  "https://dream-centre-quiz.netlify.app",
  "http://localhost:8888",
  "http://localhost:3000",
];

function getOrigin(event) {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  return ALLOWED_ORIGINS.includes(origin) ? origin : "";
}

exports.handler = async (event) => {
  const origin = getOrigin(event);
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { prompt, model } = body;

    if (!prompt || typeof prompt !== "string") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "A valid 'prompt' string is required." }),
      };
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters.`,
        }),
      };
    }

    const questionMatch = prompt.match(/(\d+)\s*MCQ/i);
    if (questionMatch && parseInt(questionMatch[1], 10) > MAX_QUESTIONS) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: `Maximum ${MAX_QUESTIONS} questions allowed.`,
        }),
      };
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "GEMINI_API_KEY environment variable is missing.",
        }),
      };
    }

    const selectedModel =
      typeof model === "string" && model.startsWith("gemini-")
        ? model
        : DEFAULT_MODEL;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      if (fetchError.name === "AbortError") {
        return {
          statusCode: 504,
          headers,
          body: JSON.stringify({
            error: "Upstream request timed out. Please try again.",
          }),
        };
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: data.error?.message || "Google API Error",
        }),
      };
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Invalid response from AI model." }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ data: rawText }),
    };
  } catch (error) {
    console.error("Function error:", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error." }),
    };
  }
};
