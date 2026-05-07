/**
 * @file services/newsScraperService.js
 * @description Scrapes live headlines from public RSS feeds and prepares them
 *              for fake-news analysis by the Sentinel AI pipeline.
 *
 *              RSS sources used (all public, no API key required)
 *              ───────────────────────────────────────────────────
 *              BBC World News   → http://feeds.bbci.co.uk/news/world/rss.xml
 *              NDTV Top Stories → https://feeds.feedburner.com/ndtvnews-top-stories
 *              Times of India   → https://timesofindia.indiatimes.com/rssfeedstopstories.cms
 *              The Hindu        → https://www.thehindu.com/news/national/feeder/default.rss
 *
 *              Caching
 *              ───────
 *              Results are cached in memory for CACHE_TTL_MS (5 minutes) to
 *              avoid hammering the RSS endpoints on every dashboard refresh.
 *
 *              Output shape per article
 *              ─────────────────────────
 *              {
 *                id:          string,   // hash-based stable ID
 *                title:       string,
 *                description: string,
 *                link:        string,
 *                source:      string,   // "BBC" | "NDTV" | etc.
 *                pubDate:     string,   // ISO 8601
 *                text:        string,   // title + description (for analysis)
 *              }
 *
 * @dependencies rss-parser, crypto, ../utils/logger
 */

const RssParser = require("rss-parser");
const crypto    = require("crypto");
const logger    = require("../utils/logger");

/* ─── RSS feed sources ───────────────────────────────────────────────────── */
const FEEDS = [
  {
    name: "BBC World",
    url:  "https://feeds.bbci.co.uk/news/world/rss.xml",
  },
  {
    name: "NDTV India",
    url:  "https://feeds.feedburner.com/ndtvnews-top-stories",
  },
  {
    name: "Times of India",
    url:  "https://timesofindia.indiatimes.com/rssfeedstopstories.cms",
  },
  {
    name: "The Hindu",
    url:  "https://www.thehindu.com/news/national/feeder/default.rss",
  },
];

/* ─── Cache ──────────────────────────────────────────────────────────────── */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _cache      = null;
let _cacheTime  = 0;

/* ─── RSS Parser instance ────────────────────────────────────────────────── */
const parser = new RssParser({
  timeout:       8000,
  headers:       { "User-Agent": "SentinelAI/1.0 RSS Scraper" },
  customFields:  { item: ["media:content", "enclosure"] },
});

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/**
 * Generates a stable short ID from a URL so the same article always gets
 * the same ID across scrape cycles.
 *
 * @param {string} url
 * @returns {string} 12-char hex string
 */
const stableId = (url) =>
  crypto.createHash("md5").update(url || String(Date.now())).digest("hex").slice(0, 12);

/**
 * Strips HTML tags from a string (RSS descriptions often contain inline HTML).
 *
 * @param {string} str
 * @returns {string}
 */
const stripHtml = (str = "") =>
  str.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Scrapes a single RSS feed and normalises each item.
 *
 * @param {{ name: string, url: string }} feed
 * @returns {Promise<Array<Object>>}
 */
const scrapeFeed = async ({ name, url }) => {
  try {
    const feed  = await parser.parseURL(url);
    const items = (feed.items || []).slice(0, 8); // max 8 articles per source

    return items.map((item) => {
      const title       = stripHtml(item.title       || "");
      const description = stripHtml(item.contentSnippet || item.description || item.summary || "");
      const link        = item.link || item.guid || url;
      const pubDate     = item.isoDate || item.pubDate || new Date().toISOString();

      return {
        id:          stableId(link),
        title,
        description,
        link,
        source:      name,
        pubDate,
        // Combined text field used by the analysis pipeline
        text:        `${title}. ${description}`.trim(),
      };
    });
  } catch (err) {
    logger.warn(`newsScraperService → failed to scrape ${name}: ${err.message}`);
    return []; // return empty array instead of crashing
  }
};

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Fetches and returns the latest news articles from all configured RSS feeds.
 * Uses in-memory cache to avoid repeated RSS requests within 5 minutes.
 *
 * @returns {Promise<Array<Object>>} Flat array of normalised news articles
 */
const fetchLatestNews = async () => {
  // Serve from cache if still fresh
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    logger.info(`newsScraperService → serving ${_cache.length} articles from cache`);
    return _cache;
  }

  logger.info(`newsScraperService → scraping ${FEEDS.length} RSS feeds…`);

  // Fetch all feeds concurrently — a single slow or failed feed won't block others
  const results = await Promise.allSettled(FEEDS.map(scrapeFeed));

  const articles = results
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value)
    // Sort newest first
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  logger.info(`newsScraperService → scraped ${articles.length} articles total`);

  // Update cache
  _cache     = articles;
  _cacheTime = Date.now();

  return articles;
};

module.exports = { fetchLatestNews };
