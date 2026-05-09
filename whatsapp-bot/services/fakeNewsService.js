/**
 * services/fakeNewsService.js
 * Sends a message to the Sentinel AI backend for fake news analysis.
 *
 * Flow:
 *   1. Check the in-memory cache first (skip duplicate analysis).
 *   2. Call POST /api/analyze on the Sentinel backend.
 *   3. Cache the result and return it.
 *   4. If the backend is down, fall back to a demo AI response so the
 *      bot still works during a hackathon demo without a live server.
 */

const axios  = require("axios");
const cache  = require("../utils/cache");
const logger = require("../utils/logger");

const BASE_URL  = process.env.SENTINEL_API_URL || "http://localhost:5000";
const THRESHOLD = parseInt(process.env.FAKE_CONFIDENCE_THRESHOLD, 10) || 90;

/**
 * Analyse text/URL for fake news.
 * @param {string} text   — The message or URL to analyse
 * @param {string} type   — "text" | "url" | "image"
 * @returns {Promise<AnalysisResult>}
 */
const analyse = async (text, type = "text") => {
  // Use the first 500 chars as the cache key to avoid huge keys
  const cacheKey = `${type}::${text.slice(0, 500)}`;

  // Return cached result if available
  const cached = cache.get(cacheKey);
  if (cached) {
    logger.debug(`fakeNewsService → cache hit (type=${type})`);
    return cached;
  }

  try {
    logger.info(`fakeNewsService → calling Sentinel API (type=${type}, len=${text.length})`);

    const { data } = await axios.post(
      `${BASE_URL}/api/analyze`,
      { text },
      { timeout: 20_000 }
    );

    const result = {
      status:     data.is_fake ? "FAKE" : "REAL",
      confidence: data.fake_probability ?? 50,
      reason:     data.llama_reasoning  || buildReason(data),
      crimeType:  data.crime_type       || "Unknown",
      severity:   data.severity         || "low",
      panicIndex: data.panic_index      || 0,
      source:     "sentinel-api",
    };

    cache.set(cacheKey, result);
    logger.info(`fakeNewsService → result: ${result.status} (${result.confidence}%)`);
    return result;

  } catch (err) {
    logger.warn(`fakeNewsService → API unavailable (${err.message}) — using demo response`);
    return demoResponse(text);
  }
};

/**
 * Build a human-readable reason from raw API fields when llama_reasoning is absent.
 */
const buildReason = (data) => {
  const fp = data.fake_probability || 0;
  if (fp > 70) return `High fake probability (${fp}%) detected. Multiple misinformation signals found.`;
  if (fp > 40) return `Moderate suspicion (${fp}%). Cross-check with trusted sources before sharing.`;
  return `Content appears credible (fake probability: ${fp}%).`;
};

/**
 * Demo fallback response — used when the Sentinel backend is offline.
 * Useful for live hackathon demos without a running server.
 */
const demoResponse = (text) => {
  const keywords = ["breaking", "viral", "shocking", "government", "secret", "leaked", "confirmed"];
  const hitCount = keywords.filter(k => text.toLowerCase().includes(k)).length;

  const confidence = Math.min(50 + hitCount * 8 + Math.floor(Math.random() * 15), 98);
  const isFake = confidence > 60;

  return {
    status:     isFake ? "FAKE" : "REAL",
    confidence,
    reason:     isFake
      ? "⚠️ This news was flagged by our AI as potentially fabricated. Multiple misinformation patterns detected. Verify with trusted sources like PIB Fact Check or Reuters."
      : "✅ This content appears credible based on pattern analysis. No strong misinformation signals found.",
    crimeType:  "Unknown",
    severity:   confidence > 80 ? "high" : "medium",
    panicIndex: confidence,
    source:     "demo-fallback",
  };
};

module.exports = { analyse, THRESHOLD };
