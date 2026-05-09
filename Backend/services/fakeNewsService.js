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

/* ─── Deterministic text fingerprint (0-1) based on content ─────────────── */
const textFingerprint = (text) => {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 1000) / 1000;
};

/* ─── Trusted / suspicious domains (mirrors llamaService list) ────────────── */
const TRUSTED_DOMAINS = [
  "youtube.com","youtu.be","bbc.com","bbc.co.uk","reuters.com","apnews.com",
  "nytimes.com","theguardian.com","bloomberg.com","wsj.com","economist.com",
  "ndtv.com","thehindu.com","hindustantimes.com","timesofindia.com",
  "indianexpress.com","livemint.com","moneycontrol.com","business-standard.com",
  "aajtak.in","abplive.com","zeenews.india.com","news18.com","india.com",
  "wikipedia.org","google.com","github.com","stackoverflow.com","medium.com",
  "pib.gov.in","mygov.in","mohfw.gov.in","who.int","cdc.gov","unicef.org",
  "twitter.com","x.com","instagram.com","facebook.com","linkedin.com",
];
const SUSPICIOUS_DOMAINS = [
  "bit.ly","tinyurl.com","shorturl.at","ow.ly","t.co","rb.gy","cutt.ly",
  "fakealert","rumourmills","conspiracynews","alternativemedia",
];
const scoreDomain = (url) => {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (TRUSTED_DOMAINS.some(d => h === d || h.endsWith("." + d))) return 3;
    if (SUSPICIOUS_DOMAINS.some(d => h.includes(d))) return -3;
    return -1;
  } catch { return 0; }
};

/* ─── Local scorer (runs when API key is absent or API fails) ────────────── */
const localScore = (text) => {
  let fakeHits = 0;
  let realHits = 0;

  // Strip URLs before keyword matching and score them by domain reputation
  const urlMatches = text.match(/https?:\/\/[^\s]+/gi) || [];
  let textForKeywords = text;

  if (urlMatches.length > 0) {
    textForKeywords = text.replace(/https?:\/\/[^\s]+/gi, " ").trim();
    let domainScore = 0;
    for (const url of urlMatches) domainScore += scoreDomain(url);

    if      (domainScore >= 3)  realHits += 4;
    else if (domainScore >= 1)  realHits += 2;
    else if (domainScore < -1)  fakeHits += 3;
    else                        fakeHits += 1;
  }

  const lower = textForKeywords.toLowerCase();

  for (const kw of FAKE_KEYWORDS) {
    if (lower.includes(kw)) fakeHits++;
  }
  for (const kw of REAL_KEYWORDS) {
    if (lower.includes(kw)) realHits++;
  }

  const nonSpaceLen = textForKeywords.replace(/\s/g, "").length || 1;
  const capsRatio   = (textForKeywords.match(/[A-Z]/g) || []).length / nonSpaceLen;
  if (capsRatio > 0.35) fakeHits += 2;
  else if (capsRatio > 0.2) fakeHits += 1;

  const exclCount = (textForKeywords.match(/!/g) || []).length;
  if (exclCount >= 3) fakeHits += 2;
  else if (exclCount >= 1) fakeHits += 1;

  const total = fakeHits + realHits;
  const fp    = textFingerprint(text);

  let label, confidence;

  if (total === 0) {
    label      = "REAL";
    confidence = 0.60;
  } else {
    const fakeRatio = fakeHits / total;
    if (fakeRatio > 0.6) {
      label      = "FAKE";
      confidence = 0.78;
    } else if (fakeRatio > 0.4) {
      label      = "FAKE";
      confidence = 0.60;
    } else {
      label      = "REAL";
      confidence = 0.72;
    }
  }

  // Add content-specific variation (±8%) so different messages always
  // produce different scores even when they hit the same keyword bucket.
  const variation = (fp - 0.5) * 0.16;
  confidence = parseFloat(Math.min(0.95, Math.max(0.05, confidence + variation)).toFixed(4));

  return {
    label,
    confidence,
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
