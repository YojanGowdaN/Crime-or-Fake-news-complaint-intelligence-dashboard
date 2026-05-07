/**
 * @file controllers/analyzeController.js
 * @description Orchestrates the full Sentinel AI analysis pipeline.
 *
 *              Pipeline:
 *              1. Input validation
 *              2. Llama 3 (Groq) + HuggingFace sentiment (parallel)
 *              3. Crime classification
 *              4. Panic Index + downstream alert/report actions
 *
 *              All numeric scores returned as integers 0-100 for the frontend.
 */

const llamaService          = require("../services/llamaService");
const fakeNewsService       = require("../services/fakeNewsService");
const sentimentService      = require("../services/sentimentService");
const crimeDetectionService = require("../services/crimeDetectionService");
const panicService          = require("../services/panicService");
const logger                = require("../utils/logger");

/**
 * POST /api/analyze
 */
const analyzeText = async (req, res, next) => {
  try {
    const { text, content } = req.body;
    const rawText = text || content;

    if (!rawText || typeof rawText !== "string" || rawText.trim().length === 0) {
      const err  = new Error("Field 'text' is required and must be a non-empty string");
      err.status = 400;
      return next(err);
    }

    const sanitisedText = rawText.trim();
    logger.info(`analyzeController → received text (${sanitisedText.length} chars)`);

    /* ── Steps 2 & 3 in parallel ────────────────────────────────────────── */
    const [llamaResult, sentimentResult, hfResult] = await Promise.all([
      llamaService.detectFakeNews(sanitisedText),
      sentimentService.scorePanic(sanitisedText),
      fakeNewsService.analyseText(sanitisedText),
    ]);

    /* ── Compute fake_probability as integer 0-100 ───────────────────────── */
    const llamaProb = llamaResult.is_fake
      ? Math.round(llamaResult.confidence * 100)
      : Math.round((1 - llamaResult.confidence) * 100);

    const hfProb = hfResult.label === "FAKE"
      ? Math.round(hfResult.confidence * 100)
      : Math.round((1 - hfResult.confidence) * 100);

    // Weighted blend: 70% Llama 3, 30% HuggingFace
    const fake_probability = Math.round(llamaProb * 0.7 + hfProb * 0.3);

    /* ── Crime classification ────────────────────────────────────────────── */
    let { crime_type, severity } = crimeDetectionService.detectCrime(
      sanitisedText,
      sentimentResult.isNegative
    );

    if (llamaResult.crime_hint && llamaResult.crime_hint !== "Unknown") {
      crime_type = llamaResult.crime_hint;
    }

    /* ── Panic Index + downstream actions ────────────────────────────────── */
    const { panic_index, location, timestamp } = await panicService.computePanicIndex({
      text:            sanitisedText,
      fake_probability,
      panic_score:     sentimentResult.panic_score,
      crime_type,
      severity,
      reasoning:       llamaResult.reasoning || null,
      confidence:      llamaResult.confidence,
    });

    /* ── Response — all scores as integers 0-100 ─────────────────────────── */
    const responsePayload = {
      fake_probability,                       // integer 0-100
      crime_type,
      severity:         severity.toLowerCase(),
      panic_score:      sentimentResult.panic_score,  // integer 0-100 from sentimentService
      panic_index,
      location,
      timestamp,
      confidence:       llamaResult.confidence,       // decimal 0-1 (for display only)
      llama_reasoning:  llamaResult.reasoning || null,
      detection_source: llamaResult.source,
      is_fake:          fake_probability > 50,
    };

    logger.info(
      `analyzeController → done | fp=${fake_probability}% | crime=${crime_type} | severity=${severity} | panic=${panic_index} | src=${llamaResult.source}`
    );

    res.status(200).json(responsePayload);
  } catch (error) {
    next(error);
  }
};

module.exports = { analyzeText };
