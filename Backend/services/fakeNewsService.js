/**
 * @file services/fakeNewsService.js
 * @description Calls the HuggingFace Inference API to score how likely a
 *              piece of text is misinformation (fake news).
 *
 *              When HUGGINGFACE_API_KEY is absent or the API is unreachable,
 *              a local keyword-based scorer runs instead of returning a static
 *              fallback — so every piece of text gets a content-specific result.
 *
 * @dependencies axios, ../utils/logger
 */

const axios  = require("axios");
const logger = require("../utils/logger");

const HF_API_URL =
  "https://api-inference.huggingface.co/models/roberta-base-openai-detector";

const REQUEST_TIMEOUT_MS = 5000;

/* ─── Local scorer keyword lists ─────────────────────────────────────────── */
const FAKE_KEYWORDS = [
  "hoax", "fake", "rumor", "rumour", "unverified", "false", "fabricated",
  "propaganda", "conspiracy", "misleading", "misinformation", "debunked",
  "no evidence", "allegedly", "supposedly", "claim", "viral lie",
  "spreading", "no official", "unconfirmed", "disputed",
];

const REAL_KEYWORDS = [
  "confirmed", "verified", "official", "authorities", "government",
  "police said", "court", "hospital", "ministry", "university",
  "research", "study", "according to", "statement", "press release",
  "data", "evidence", "spokesperson", "report shows", "reuters",
  "bbc", "associated press", "icmr", "who", "cdc",
];

/* ─── Local scorer (runs when API key is absent or API fails) ────────────── */
const localScore = (text) => {
  const lower = text.toLowerCase();

  let fakeHits = 0;
  let realHits = 0;

  for (const kw of FAKE_KEYWORDS) {
    if (lower.includes(kw)) fakeHits++;
  }
  for (const kw of REAL_KEYWORDS) {
    if (lower.includes(kw)) realHits++;
  }

  const nonSpaceLen = text.replace(/\s/g, "").length || 1;
  const capsRatio   = (text.match(/[A-Z]/g) || []).length / nonSpaceLen;
  if (capsRatio > 0.35) fakeHits += 2;
  else if (capsRatio > 0.2) fakeHits += 1;

  const exclCount = (text.match(/!/g) || []).length;
  if (exclCount >= 3) fakeHits += 2;
  else if (exclCount >= 1) fakeHits += 1;

  const total = fakeHits + realHits;

  let label, confidence;

  if (total === 0) {
    label      = "REAL";
    confidence = 0.55;
  } else {
    const fakeRatio = fakeHits / total;
    if (fakeRatio > 0.6) {
      label      = "FAKE";
      confidence = Math.min(0.95, 0.60 + fakeRatio * 0.35);
    } else if (fakeRatio > 0.4) {
      label      = "FAKE";
      confidence = 0.52 + fakeRatio * 0.20;
    } else {
      label      = "REAL";
      confidence = Math.min(0.95, 0.55 + (1 - fakeRatio) * 0.35);
    }
  }

  return {
    label,
    confidence: parseFloat(confidence.toFixed(4)),
  };
};

/* ─── HuggingFace response normaliser ───────────────────────────────────── */
const normaliseResponse = (data) => {
  const results = data[0];
  const top     = results.reduce((best, cur) =>
    cur.score > best.score ? cur : best
  );
  return {
    label:      top.label.toUpperCase(),
    confidence: parseFloat(top.score.toFixed(4)),
  };
};

/* ─── Public API ─────────────────────────────────────────────────────────── */
const analyseText = async (text) => {
  const apiKey = process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    logger.warn("fakeNewsService → HUGGINGFACE_API_KEY not set; using local scorer");
    return localScore(text);
  }

  try {
    logger.info("fakeNewsService → calling HuggingFace Inference API…");

    const response = await axios.post(
      HF_API_URL,
      { inputs: text },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: REQUEST_TIMEOUT_MS,
      }
    );

    const result = normaliseResponse(response.data);
    logger.info(
      `fakeNewsService → result: ${result.label} (confidence ${result.confidence})`
    );
    return result;
  } catch (error) {
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      logger.warn(
        `fakeNewsService → HuggingFace timed out after ${REQUEST_TIMEOUT_MS}ms — using local scorer`
      );
    } else {
      logger.warn(
        `fakeNewsService → HuggingFace API error: ${error.message} — using local scorer`
      );
    }
    return localScore(text);
  }
};

module.exports = { analyseText };
