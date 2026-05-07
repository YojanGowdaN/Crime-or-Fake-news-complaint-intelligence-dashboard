/**
 * @file services/sentimentService.js
 * @description Scores the emotional intensity (panic / fear level) of a
 *              piece of text by calling the HuggingFace sentiment pipeline.
 *
 *              Model used
 *              ──────────
 *              distilbert-base-uncased-finetuned-sst-2-english
 *                A lightweight DistilBERT model fine-tuned on the Stanford
 *                Sentiment Treebank.  Returns two labels:
 *                  "POSITIVE" → calm, factual, reassuring tone
 *                  "NEGATIVE" → fearful, angry, alarming tone
 *
 *              Panic score derivation
 *              ──────────────────────
 *              panic_score = Math.round(negative_confidence × 100)
 *
 *              If the model returns POSITIVE with high confidence the panic
 *              score is inverted:
 *                panic_score = Math.round((1 - positive_confidence) × 100)
 *              …so that calm text always yields a low score.
 *
 *              Fallback behaviour
 *              ──────────────────
 *              On any API failure a moderate panic_score of 50 is returned
 *              so the pipeline can continue without crashing.
 *
 * @dependencies axios, ../utils/logger
 */

const axios  = require("axios");
const logger = require("../utils/logger");

/* ─── Constants ─────────────────────────────────────────────────────────── */

const HF_API_URL =
  "https://api-inference.huggingface.co/models/distilbert-base-uncased-finetuned-sst-2-english";

const REQUEST_TIMEOUT_MS = 5000;

/** Returned when the model cannot be reached */
const FALLBACK = { panic_score: 50, isNegative: true };

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Analyses the emotional tone of `text` and converts it to a panic score.
 *
 * @param {string} text - The raw input text
 * @returns {Promise<{ panic_score: number, isNegative: boolean }>}
 *   panic_score  – integer 0-100 (100 = maximum panic / fear)
 *   isNegative   – true when the model's dominant label is NEGATIVE
 */
const scorePanic = async (text) => {
  try {
    logger.info("sentimentService → calling HuggingFace sentiment pipeline…");

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

    /*
     * HuggingFace returns an array of arrays:
     *   [[{ label: "NEGATIVE", score: 0.97 }, { label: "POSITIVE", score: 0.03 }]]
     */
    const results    = response.data[0];
    const negativeEntry = results.find((r) => r.label === "NEGATIVE");
    const positiveEntry = results.find((r) => r.label === "POSITIVE");

    let panic_score;
    let isNegative;

    if (negativeEntry && negativeEntry.score >= 0.5) {
      // Dominant label is NEGATIVE — map confidence directly to panic score
      panic_score = Math.round(negativeEntry.score * 100);
      isNegative  = true;
    } else {
      // Dominant label is POSITIVE — invert so calm text → low panic score
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
        `sentimentService → HuggingFace timed out after ${REQUEST_TIMEOUT_MS}ms — using fallback`
      );
    } else {
      logger.warn(
        `sentimentService → HuggingFace API error: ${error.message} — using fallback`
      );
    }

    return FALLBACK;
  }
};

module.exports = { scorePanic };
