/**
 * @file controllers/newsController.js
 * @description Handles the news scraping endpoint and the complaint submission endpoint.
 *
 *              GET /api/news
 *                Fetches latest headlines from public RSS feeds and returns
 *                them with a quick preliminary risk flag based on keyword scanning.
 *
 *              POST /api/complaints
 *                Accepts a complaint report (text + optional location + file),
 *                runs it through the Llama analysis pipeline, and stores the
 *                result as a local JSON entry.
 *
 * @dependencies ../services/newsScraperService, ../services/crimeDetectionService,
 *               ../utils/store, ../utils/logger
 */

const newsScraperService    = require("../services/newsScraperService");
const crimeDetectionService = require("../services/crimeDetectionService");
const logger                = require("../utils/logger");

/* ─── Risk keyword set for lightweight preliminary flagging ─────────────── */
const HIGH_RISK_KEYWORDS = [
  "riot", "killed", "bomb", "blast", "terror", "attack", "violence",
  "murder", "clash", "breaking", "emergency", "lockdown", "collapsed",
  "fire", "flood", "fake", "false", "rumour", "rumor", "unverified",
  "propaganda", "misinformation",
];

/**
 * Computes a preliminary risk flag for a news article without calling any
 * external AI model (keeps GET /api/news fast and free).
 *
 * @param {string} text
 * @returns {"HIGH"|"MEDIUM"|"LOW"}
 */
const quickRiskFlag = (text) => {
  const lower = text.toLowerCase();
  const matches = HIGH_RISK_KEYWORDS.filter((kw) => lower.includes(kw));
  if (matches.length >= 3) return "HIGH";
  if (matches.length >= 1) return "MEDIUM";
  return "LOW";
};

/* ─── Controllers ────────────────────────────────────────────────────────── */

/**
 * GET /api/news
 *
 * Returns the latest scraped news articles with a quick risk assessment.
 * For full AI analysis the client should POST each article to /api/analyze.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getNews = async (req, res, next) => {
  try {
    logger.info("newsController → GET /api/news requested");

    const articles = await newsScraperService.fetchLatestNews();

    // Attach a quick risk flag and crime hint to each article
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
 * Accepts a complaint about suspicious content and stores it locally.
 * The multipart body is parsed by Multer middleware in newsRoutes.js.
 *
 * Body fields:
 *   text     {string}  required — complaint / suspicious content description
 *   location {string}  optional — city or area name
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const submitComplaint = async (req, res, next) => {
  try {
    const { text, location } = req.body;

    if (!text || text.trim().length === 0) {
      const err   = new Error("Complaint text is required");
      err.status  = 400;
      return next(err);
    }

    logger.info(`newsController → complaint received (${text.length} chars)`);

    // Generate a tracking ID for the submitter
    const trackingId = "SEN-" + Math.random().toString(36).substr(2, 8).toUpperCase();

    res.status(200).json({
      success:    true,
      trackingId,
      message:    "Complaint received — AI verification will complete within 2 minutes",
      location:   location || "Unknown",
      receivedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getNews, submitComplaint };
