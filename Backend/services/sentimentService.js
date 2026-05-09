/**
 * @file services/sentimentService.js
 * @description Scores the emotional intensity (panic / fear level) of a
 *              piece of text by calling the HuggingFace sentiment pipeline.
 *
 *              When HUGGINGFACE_API_KEY is absent or the API is unreachable,
 *              a local keyword-based scorer runs instead of returning the static
 *              fallback value — so every piece of text gets a content-specific
 *              panic score.
 *
 * @dependencies axios, ../utils/logger
 */

const axios  = require("axios");
const logger = require("../utils/logger");

const HF_API_URL =
  "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english";

const REQUEST_TIMEOUT_MS = 5000;

/* ─── Local scorer keyword lists ─────────────────────────────────────────── */
const PANIC_WORDS = [
  "killed", "dead", "death", "murder", "attack", "bomb", "blast",
  "terror", "riot", "violence", "crisis", "emergency", "danger",
  "threat", "breaking", "urgent", "critical", "collapse", "panic",
  "fear", "chaos", "destruction", "catastrophe", "disaster", "war",
  "shooting", "explosion", "flood", "fire", "trapped", "missing",
  "lockdown", "curfew", "arrested", "detained", "hostage", "casualty",
  "casualties", "injured", "wounded", "fleeing", "evacuation", "shock",
  "horrific", "devastating", "brutal", "massacre", "massacre",
];

const CALM_WORDS = [
  "peace", "agreement", "success", "growth", "celebration", "achievement",
  "improvement", "cooperation", "progress", "positive", "safe", "secure",
  "recovery", "development", "support", "help", "good", "great", "excellent",
  "innovation", "launch", "award", "victory", "solution", "resolved",
  "cooperation", "harmony", "stable", "confirmed safe", "rescued", "relief",
  "recovered", "normal", "calm", "cleared", "no injuries", "no casualties",
];

/* ─── Local scorer ───────────────────────────────────────────────────────── */
const localScore = (text) => {
  const lower = text.toLowerCase();

  let panicHits = 0;
  let calmHits  = 0;

  for (const w of PANIC_WORDS) {
    if (lower.includes(w)) panicHits++;
  }
  for (const w of CALM_WORDS) {
    if (lower.includes(w)) calmHits++;
  }

  const exclCount = (text.match(/!/g) || []).length;
  if (exclCount >= 2) panicHits++;

  const total = panicHits + calmHits;
  let panic_score, isNegative;

  if (total === 0) {
    panic_score = 25;
    isNegative  = false;
  } else {
    const panicRatio = panicHits / total;
    panic_score = Math.round(panicRatio * 85 + 10);
    isNegative  = panicRatio >= 0.5;
  }

  return {
    panic_score: Math.min(100, panic_score),
    isNegative,
  };
};

/* ─── Public API ─────────────────────────────────────────────────────────── */
const scorePanic = async (text) => {
  const apiKey = process.env.HUGGINGFACE_API_KEY;

  if (!apiKey) {
    logger.warn("sentimentService → HUGGINGFACE_API_KEY not set; using local scorer");
    return localScore(text);
  }

  try {
    logger.info("sentimentService → calling HuggingFace sentiment pipeline…");

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

    const results       = response.data[0];
    const negativeEntry = results.find((r) => r.label === "NEGATIVE");
    const positiveEntry = results.find((r) => r.label === "POSITIVE");

    let panic_score, isNegative;

    if (negativeEntry && negativeEntry.score >= 0.5) {
      panic_score = Math.round(negativeEntry.score * 100);
      isNegative  = true;
    } else {
      const posScore = positiveEntry ? positiveEntry.score : 0.5;
      panic_score    = Math.round((1 - posScore) * 100);
      isNegative     = false;
    }

    logger.info(
      `sentimentService → panic_score=${panic_score}, isNegative=${isNegative}`
    );

    return { panic_score, isNegative };
  } catch (error) {
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      logger.warn(
        `sentimentService → HuggingFace timed out after ${REQUEST_TIMEOUT_MS}ms — using local scorer`
      );
    } else {
      logger.warn(
        `sentimentService → HuggingFace API error: ${error.message} — using local scorer`
      );
    }
    return localScore(text);
  }
};

module.exports = { scorePanic };
