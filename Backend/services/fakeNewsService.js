/**
 * @file services/fakeNewsService.js
 * @description Calls the HuggingFace Inference API to score how likely a
 *              piece of text is misinformation (fake news).
 *
 *              Model used
 *              ──────────
 *              roberta-base-openai-detector
 *                A RoBERTa model fine-tuned by OpenAI to detect machine-
 *                generated / fake text.  Returns two labels:
 *                  "Real" → genuine human-written content
 *                  "Fake" → likely AI-generated or fabricated
 *
 *              Fallback behaviour
 *              ──────────────────
 *              If the HuggingFace API is unavailable (network error, 503,
 *              timeout) the service returns a deterministic mock response
 *              so the rest of the analysis pipeline can continue unimpeded.
 *              A warning is logged so operators know the real model was not
 *              consulted.
 *
 * @dependencies axios, ../utils/logger
 */

const axios  = require("axios");
const logger = require("../utils/logger");

/* ─── Constants ─────────────────────────────────────────────────────────── */

const HF_API_URL =
  "https://api-inference.huggingface.co/models/roberta-base-openai-detector";

/** Abort HuggingFace calls that take longer than 5 seconds */
const REQUEST_TIMEOUT_MS = 5000;

/** Returned when the real model cannot be reached */
const FALLBACK_RESPONSE = { label: "FAKE", confidence: 0.75 };

/* ─── Helper ─────────────────────────────────────────────────────────────── */

/**
 * Normalises the raw HuggingFace response array into the shape the rest of
 * the application expects: { label: "FAKE"|"REAL", confidence: <0-1> }.
 *
 * HuggingFace returns an array of arrays, e.g.:
 *   [[{ label: "Real", score: 0.12 }, { label: "Fake", score: 0.88 }]]
 *
 * @param {Array} data - Raw HuggingFace API response
 * @returns {{ label: string, confidence: number }}
 */
const normaliseResponse = (data) => {
  // data[0] is the result for the first (and only) input text
  const results = data[0];

  // Find the entry with the highest score — that is the predicted label
  const top = results.reduce((best, current) =>
    current.score > best.score ? current : best
  );

  return {
    label:      top.label.toUpperCase(), // "Real" → "REAL", "Fake" → "FAKE"
    confidence: parseFloat(top.score.toFixed(4)),
  };
};

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Analyses `text` for fake-news probability using HuggingFace.
 *
 * @param {string} text - The raw input text to classify
 * @returns {Promise<{ label: "FAKE"|"REAL", confidence: number }>}
 *           confidence is a decimal between 0 and 1
 */
const analyseText = async (text) => {
  try {
    logger.info("fakeNewsService → calling HuggingFace Inference API…");

    const response = await axios.post(
      HF_API_URL,
      { inputs: text },
      {
        headers: {
          Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
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
    // Distinguish between a timeout and a generic network / API error
    if (error.code === "ECONNABORTED" || error.message.includes("timeout")) {
      logger.warn(
        `fakeNewsService → HuggingFace request timed out after ${REQUEST_TIMEOUT_MS}ms — using fallback`
      );
    } else {
      logger.warn(
        `fakeNewsService → HuggingFace API error: ${error.message} — using fallback`
      );
    }

    // Return the mock so downstream services can still produce a result
    return FALLBACK_RESPONSE;
  }
};

module.exports = { analyseText };
