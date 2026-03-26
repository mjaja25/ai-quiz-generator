const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { handler } = require("../netlify/functions/generate-quiz.js");

function mockEvent(method = "POST", body = null, origin = "") {
  return {
    httpMethod: method,
    body: body ? JSON.stringify(body) : null,
    headers: {
      origin: origin,
    },
  };
}

describe("generate-quiz handler", () => {
  it("rejects non-POST methods", async () => {
    const res = await handler(mockEvent("GET"));
    assert.equal(res.statusCode, 405);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes("Method Not Allowed"));
  });

  it("returns 400 when prompt is missing", async () => {
    const res = await handler(mockEvent("POST", {}));
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes("prompt"));
  });

  it("returns 400 when prompt is not a string", async () => {
    const res = await handler(mockEvent("POST", { prompt: 123 }));
    assert.equal(res.statusCode, 400);
  });

  it("returns 400 when prompt exceeds max length", async () => {
    const longPrompt = "a".repeat(8001);
    const res = await handler(mockEvent("POST", { prompt: longPrompt }));
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes("maximum length"));
  });

  it("returns 400 when question count exceeds max", async () => {
    const prompt = "Generate 25 MCQs about science";
    const res = await handler(mockEvent("POST", { prompt }));
    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes("questions allowed"));
  });

  it("handles OPTIONS preflight request", async () => {
    const res = await handler(mockEvent("OPTIONS"));
    assert.equal(res.statusCode, 204);
    assert.ok(res.headers["Access-Control-Allow-Methods"].includes("POST"));
  });

  it("sets CORS headers for allowed origins", async () => {
    const res = await handler(
      mockEvent("POST", { prompt: "test" }, "http://localhost:8888"),
    );
    assert.equal(
      res.headers["Access-Control-Allow-Origin"],
      "http://localhost:8888",
    );
  });

  it("returns empty CORS origin for disallowed origins", async () => {
    const res = await handler(
      mockEvent("POST", { prompt: "test" }, "https://evil.com"),
    );
    assert.equal(res.headers["Access-Control-Allow-Origin"], "");
  });

  it("returns 500 when GEMINI_API_KEY is not set", async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const res = await handler(
      mockEvent("POST", { prompt: "Generate 5 MCQs about math" }),
    );
    assert.equal(res.statusCode, 500);
    const body = JSON.parse(res.body);
    assert.ok(body.error.includes("GEMINI_API_KEY"));
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
  });
});
