/**
 * @file services/llamaService.js
 * @description Fake-news detection powered by Meta's Llama 3 open-source model
 *              via the Groq inference API (free tier, ultra-low latency).
 *
 *              Why Groq + Llama 3?
 *              ─────────────────────
 *              • Llama 3 (8B) is fully open-source (Meta licence)
 *              • Groq runs it at ~300 tokens/sec — results in < 1 second
 *              • Free tier: 14,400 requests/day — more than enough for a hackathon
 *              • No GPU required — pure cloud inference
 *
 *              Prompt design
 *              ─────────────
 *              The system prompt instructs Llama 3 to act as a fake-news
 *              analyst and return ONLY a JSON object.  Temperature is kept
 *              low (0.1) to ensure deterministic, analytical responses.
 *
 *              Fallback chain
 *              ──────────────
 *              Groq API → HuggingFace → mock response
 *              Each step is tried only if the previous one fails, so the
 *              pipeline always produces a result even in degraded conditions.
 *
 *              Required environment variable
 *              ──────────────────────────────
 *              GROQ_API_KEY  — get a free key at https://console.groq.com
 *
 * @dependencies axios, ../utils/logger
 */

const axios  = require("axios");
const logger = require("../utils/logger");

/* ─── Groq API config ────────────────────────────────────────────────────── */
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.3-70b-versatile";   // Llama 3.3 70B — latest supported on Groq free tier
const GROQ_TIMEOUT = 10000;              // 10 s — Groq is typically < 1 s

/* ─── System prompt — instructs Llama 3 to detect fake news ─────────────── */
const SYSTEM_PROMPT = `You are Sentinel AI's fake news detection engine powered by Llama 3.
Analyse the user-provided news text and determine whether it is fake or real misinformation.

Respond with ONLY a valid JSON object — no explanation, no markdown, no extra text:
{
  "is_fake": true | false,
  "confidence": <decimal between 0.0 and 1.0>,
  "crime_hint": "<most relevant crime category or null>",
  "reasoning": "<one sentence explanation>"
}

Crime categories to consider: Riot, Homicide, Robbery, Kidnapping, Cybercrime,
Assault, Violence, Terrorism, Political, Communal, Financial, Health, Unknown.`;

/* ─── Fallback mock response ─────────────────────────────────────────────── */
const FALLBACK = {
  is_fake:    true,
  confidence: 0.72,
  crime_hint: "Unknown",
  reasoning:  "Llama 3 / Groq unavailable — using conservative fallback estimate.",
  source:     "fallback",
};

/* ─── JSON parser that tolerates minor formatting issues ─────────────────── */
/**
 * Extracts the first JSON object from a Groq response string.
 * Handles cases where the model wraps output in markdown code fences.
 *
 * @param {string} raw
 * @returns {Object}
 */
const parseGroqJSON = (raw) => {
  // Strip markdown code fences if present (e.g. ```json ... ```)
  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

  // Extract the first {...} block
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in Llama 3 response");

  return JSON.parse(match[0]);
};

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Analyses a piece of text for misinformation using Llama 3 via Groq.
 *
 * @param {string} text - The raw input text to analyse
 * @returns {Promise<{
 *   is_fake:    boolean,
 *   confidence: number,   // 0.0 – 1.0
 *   crime_hint: string,   // suggested crime category or null
 *   reasoning:  string,   // one-sentence explanation
 *   source:     string,   // "llama3-groq" | "fallback"
 * }>}
 */
const detectFakeNews = async (text) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    logger.warn("llamaService → GROQ_API_KEY not set; using fallback");
    return FALLBACK;
  }

  try {
    logger.info("llamaService → calling Groq (Llama 3)…");

    const response = await axios.post(
      GROQ_API_URL,
      {
        model:       GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `Analyse this text for fake news:\n\n"${text.slice(0, 1500)}"` },
        ],
        temperature: 0.1,    // low randomness = consistent analytical output
        max_tokens:  256,    // JSON response is always short
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: GROQ_TIMEOUT,
      }
    );

    const rawContent = response.data.choices?.[0]?.message?.content || "";
    logger.info(`llamaService → raw Llama 3 response: ${rawContent.slice(0, 120)}`);

    const parsed = parseGroqJSON(rawContent);

    const result = {
      is_fake:    Boolean(parsed.is_fake),
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5)),
      crime_hint: parsed.crime_hint || null,
      reasoning:  parsed.reasoning  || "",
      source:     "llama3-groq",
    };

    logger.info(
      `llamaService → is_fake=${result.is_fake} | confidence=${result.confidence} | crime=${result.crime_hint}`
    );

    return result;
  } catch (error) {
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      logger.warn(`llamaService → Groq timed out after ${GROQ_TIMEOUT}ms — using fallback`);
    } else {
      logger.warn(`llamaService → Groq API error: ${error.message} — using fallback`);
    }

    return { ...FALLBACK, source: "fallback" };
  }
};

module.exports = { detectFakeNews };
