const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_PROMPT_LENGTH = 8000;
const MAX_QUESTIONS = 40;
const API_TIMEOUT_MS = 55000;

export const maxDuration = 60;

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { prompt, model } = req.body || {};

    if (!prompt || typeof prompt !== "string") {
      return res
        .status(400)
        .json({ error: "A valid 'prompt' string is required." });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      return res.status(400).json({
        error: `Prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters.`,
      });
    }

    const questionMatch = prompt.match(/(\d+)\s*MCQ/i);
    if (questionMatch && parseInt(questionMatch[1], 10) > MAX_QUESTIONS) {
      return res.status(400).json({
        error: `Maximum ${MAX_QUESTIONS} questions allowed.`,
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res
        .status(500)
        .json({ error: "GEMINI_API_KEY environment variable is missing." });
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
        return res
          .status(504)
          .json({ error: "Upstream request timed out. Please try again." });
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    const data = await response.json();

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: data.error?.message || "Google API Error" });
    }

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(502).json({ error: "Invalid response from AI model." });
    }

    return res.status(200).json({ data: rawText });
  } catch (error) {
    console.error("Function error:", error.message);
    return res.status(500).json({ error: "Internal server error." });
  }
}
