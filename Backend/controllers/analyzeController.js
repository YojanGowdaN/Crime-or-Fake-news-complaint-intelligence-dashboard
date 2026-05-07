/**
 * @file controllers/analyzeController.js
 * @description Orchestrates the full Sentinel AI analysis pipeline for a
 *              single piece of text submitted via POST /api/analyze.
 *
 *              Pipeline (in order)
 *              ───────────────────
 *              1. Input validation
 *              2. Llama 3 (Groq) fake-news detection  ┐ run in
 *              3. HuggingFace sentiment scoring        ┘ parallel
 *              4. Crime classification (keyword + NLP)
 *              5. Panic Index calculation + downstream actions
 *
 *              Steps 2 & 3 run concurrently via Promise.all to halve latency.
 *              Llama 3 result is used as the primary fake-news signal;
 *              HuggingFace RoBERTa is used as a cross-check / fallback.
 *
 * @dependencies ../services/*, ../utils/logger
 */

const llamaService          = require("../services/llamaService");
const fakeNewsService       = require("../services/fakeNewsService");
const sentimentService      = require("../services/sentimentService");
const crimeDetectionService = require("../services/crimeDetectionService");
const panicService          = require("../services/panicService");
const logger                = require("../utils/logger");

/**
 * POST /api/analyze
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const analyzeText = async (req, res, next) => {
  try {
    const { text } = req.body;

    /* ── Input validation ──────────────────────────────────────────────── */
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      const err  = new Error("Field 'text' is required and must be a non-empty string");
      err.status = 400;
      return next(err);
    }

    const sanitisedText = text.trim();
    logger.info(`analyzeController → received text (${sanitisedText.length} chars)`);

    /* ── Steps 2 & 3 in parallel ─────────────────────────────────────────
     *   Llama 3 (primary fake detector) + HuggingFace sentiment run
     *   concurrently so total wait ≈ max(llamaTime, sentimentTime).
     */
    const [llamaResult, sentimentResult, hfResult] = await Promise.all([
      llamaService.detectFakeNews(sanitisedText),
      sentimentService.scorePanic(sanitisedText),
      fakeNewsService.analyseText(sanitisedText),
    ]);

    /* ── Compute fake_probability (0-100) ────────────────────────────────
     *   Primary signal: Llama 3 confidence
     *   Cross-check:    HuggingFace RoBERTa
     *   We blend them 70% Llama / 30% HuggingFace for best accuracy.
     */
    const llamaProb = llamaResult.is_fake
      ? Math.round(llamaResult.confidence * 100)
      : Math.round((1 - llamaResult.confidence) * 100);

    const hfProb = hfResult.label === "FAKE"
      ? Math.round(hfResult.confidence * 100)
      : Math.round((1 - hfResult.confidence) * 100);

    // Weighted blend: Llama carries more weight as it is the LLM
    const fake_probability = Math.round(llamaProb * 0.7 + hfProb * 0.3);

    /* ── Step 4: Crime classification ────────────────────────────────────
     *   Pass Llama's crime_hint so the keyword service can upgrade its
     *   classification when the LLM has higher-quality context.
     */
    let { crime_type, severity } = crimeDetectionService.detectCrime(
      sanitisedText,
      sentimentResult.isNegative
    );

    // If Llama gave us a meaningful crime hint, prefer it
    if (llamaResult.crime_hint && llamaResult.crime_hint !== "Unknown") {
      crime_type = llamaResult.crime_hint;
    }

    /* ── Step 5: Panic Index + downstream actions ─────────────────────── */
    const { panic_index, location, timestamp } = await panicService.computePanicIndex({
      text: sanitisedText,
      fake_probability,
      panic_score: sentimentResult.panic_score,
      crime_type,
      severity,
    });

    /* ── Build API response ──────────────────────────────────────────────
     *   All numeric scores are integers 0-100 for consistent frontend use.
     */
    const responsePayload = {
      fake_probability,
      crime_type,
      severity,
      panic_score:  sentimentResult.panic_score,
      panic_index,
      location,
      timestamp,
      // Extra fields for frontend display
      llama_reasoning: llamaResult.reasoning || null,
      detection_source: llamaResult.source,
    };

    logger.info(
      `analyzeController → done | fp=${fake_probability}% | crime=${crime_type} | severity=${severity} | panic=${panic_index} | source=${llamaResult.source}`
    );

    res.status(200).json(responsePayload);
  } catch (error) {
    next(error);
  }
};

module.exports = { analyzeText };
