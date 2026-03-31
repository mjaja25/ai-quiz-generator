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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method Not Allowed" }),
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

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: "Failed to fetch models from Gemini API.",
        }),
      };
    }

    const data = await response.json();
    const models = (data.models || [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => ({
        id: m.name.replace("models/", ""),
        name: m.displayName || m.name.replace("models/", ""),
      }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ models }),
    };
  } catch (error) {
    console.error("List models error:", error.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error." }),
    };
  }
};
