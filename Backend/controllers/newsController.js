/**
 * @file controllers/newsController.js
 * @description Handles the news scraping endpoint and the complaint submission endpoint.
 *
 *              GET /api/news
 *                Fetches latest headlines from public RSS feeds and returns
 *                them with a quick preliminary risk flag based on keyword scanning.
 *
 *              POST /api/complaints
 *                Accepts a complaint report (text + optional location + screenshot),
 *                runs it through the Llama analysis pipeline, and if high-risk,
 *                auto-creates an authority report.
 *
 * @dependencies ../services/*, ../utils/*, ../utils/logger
 */

const newsScraperService    = require("../services/newsScraperService");
const crimeDetectionService = require("../services/crimeDetectionService");
const llamaService          = require("../services/llamaService");
const sentimentService      = require("../services/sentimentService");
const fakeNewsService       = require("../services/fakeNewsService");
const panicService          = require("../services/panicService");
const logger                = require("../utils/logger");

const HIGH_RISK_KEYWORDS = [
  "riot", "killed", "bomb", "blast", "terror", "attack", "violence",
  "murder", "clash", "breaking", "emergency", "lockdown", "collapsed",
  "fire", "flood", "fake", "false", "rumour", "rumor", "unverified",
  "propaganda", "misinformation",
];

/**
 * Quick risk flag without calling AI (keeps GET /api/news fast).
 * @param {string} text
 * @returns {"HIGH"|"MEDIUM"|"LOW"}
 */
const quickRiskFlag = (text) => {
  const lower  = text.toLowerCase();
  const matches = HIGH_RISK_KEYWORDS.filter((kw) => lower.includes(kw));
  if (matches.length >= 3) return "HIGH";
  if (matches.length >= 1) return "MEDIUM";
  return "LOW";
};

/* ─── Controllers ────────────────────────────────────────────────────────── */

/**
 * GET /api/news
 */
const getNews = async (req, res, next) => {
  try {
    logger.info("newsController → GET /api/news requested");

    const articles = await newsScraperService.fetchLatestNews();

    const enriched = articles.map((article) => {
      const { crime_type } = crimeDetectionService.detectCrime(article.text || "");
      return {
        ...article,
        risk:       quickRiskFlag(article.text || ""),
        crime_hint: crime_type,
      };
    });

    logger.info(`newsController → returning ${enriched.length} enriched articles`);
    res.status(200).json(enriched);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/complaints
 *
 * Accepts a complaint about suspicious content.
 * Runs the full AI pipeline asynchronously and auto-creates an authority
 * report if the content is determined to be high-risk.
 *
 * Body fields:
 *   text       {string}  required — complaint / suspicious content
 *   location   {string}  optional — city or area name
 *   screenshot {file}    optional — image evidence (via multipart)
 */
const submitComplaint = async (req, res, next) => {
  try {
    const { text, location } = req.body;

    if (!text || text.trim().length === 0) {
      const err  = new Error("Complaint text is required");
      err.status = 400;
      return next(err);
    }

    const sanitised  = text.trim();
    const trackingId = "SEN-" + Math.random().toString(36).substr(2, 8).toUpperCase();

    logger.info(`newsController → complaint received (${sanitised.length} chars) → ${trackingId}`);

    res.status(200).json({
      success:    true,
      trackingId,
      message:    "Complaint received — AI verification in progress",
      location:   location || "Unknown",
      receivedAt: new Date().toISOString(),
    });

    /* ── Background AI analysis ─────────────────────────────────────────── */
    setImmediate(async () => {
      try {
        logger.info(`newsController → running background AI analysis for ${trackingId}`);

        const [llamaResult, sentimentResult, hfResult] = await Promise.all([
          llamaService.detectFakeNews(sanitised),
          sentimentService.scorePanic(sanitised),
          fakeNewsService.analyseText(sanitised),
        ]);

        const llamaProb = llamaResult.is_fake
          ? Math.round(llamaResult.confidence * 100)
          : Math.round((1 - llamaResult.confidence) * 100);

        const hfProb = hfResult.label === "FAKE"
          ? Math.round(hfResult.confidence * 100)
          : Math.round((1 - hfResult.confidence) * 100);

        const fake_probability = Math.round(llamaProb * 0.7 + hfProb * 0.3);

        let { crime_type, severity } = crimeDetectionService.detectCrime(
          sanitised,
          sentimentResult.isNegative
        );

        if (llamaResult.crime_hint && llamaResult.crime_hint !== "Unknown") {
          crime_type = llamaResult.crime_hint;
        }

        await panicService.computePanicIndex({
          text:            sanitised,
          fake_probability,
          panic_score:     sentimentResult.panic_score,
          crime_type,
          severity,
          title:           `Complaint: ${sanitised.slice(0, 80)}`,
          reasoning:       llamaResult.reasoning || null,
          confidence:      llamaResult.confidence,
        });

        logger.info(`newsController → background analysis done for ${trackingId} | fp=${fake_probability}%`);
      } catch (bgErr) {
        logger.error(`newsController → background analysis failed for ${trackingId}: ${bgErr.message}`);
      }
    });

  } catch (error) {
    next(error);
  }
};

module.exports = { getNews, submitComplaint };
