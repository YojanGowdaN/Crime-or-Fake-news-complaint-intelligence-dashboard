/**
 * @file services/crimeDetectionService.js
 * @description Classifies the crime type present in a piece of text and
 *              assigns a severity level.
 *
 *              Detection strategy
 *              ──────────────────
 *              1. Keyword scan  — the text is lower-cased and checked against
 *                 a curated keyword→category map.  The first matching keyword
 *                 wins (keywords are checked in declaration order).
 *              2. Multi-keyword scoring — counts how many distinct crime
 *                 keywords appear to upgrade severity (e.g. two HIGH-risk
 *                 keywords → CRITICAL).
 *              3. Fallback — if no keyword matches the crime_type is "Unknown"
 *                 and severity defaults to MEDIUM or LOW based on sentiment
 *                 (severity can be overridden by the caller after sentiment
 *                 analysis is complete).
 *
 *              Severity matrix
 *              ───────────────
 *              ┌─────────────────────────────┬──────────┐
 *              │ Condition                   │ Severity │
 *              ├─────────────────────────────┼──────────┤
 *              │ Terrorism keyword found     │ CRITICAL │
 *              │ ≥ 2 crime keywords found    │ HIGH     │
 *              │ 1 crime keyword found       │ HIGH     │
 *              │ Negative sentiment, no crime│ MEDIUM   │
 *              │ No match, neutral sentiment │ LOW      │
 *              └─────────────────────────────┴──────────┘
 *
 * @dependencies ../utils/logger
 */

const logger = require("../utils/logger");

/* ─── Keyword → Crime-type map ──────────────────────────────────────────── */
// Keys are lower-case substrings to match in the input text.
// Values are the canonical crime category names returned in the API response.
const CRIME_KEYWORD_MAP = {
  riot:      "Riot",
  protest:   "Civil Unrest",
  murder:    "Homicide",
  killed:    "Homicide",
  shooting:  "Homicide",
  robbery:   "Robbery",
  theft:     "Robbery",
  loot:      "Robbery",
  kidnap:    "Kidnapping",
  abduct:    "Kidnapping",
  hack:      "Cybercrime",
  phishing:  "Cybercrime",
  breach:    "Cybercrime",
  assault:   "Assault",
  attack:    "Assault",
  stab:      "Assault",
  violence:  "Violence",
  bomb:      "Terrorism",
  explosive: "Terrorism",
  terror:    "Terrorism",
  blast:     "Terrorism",
};

/** Crime types that immediately warrant CRITICAL severity */
const CRITICAL_CRIMES = new Set(["Terrorism"]);

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Detects crime type and severity from raw text.
 *
 * @param {string} text - The raw input text to classify
 * @param {boolean} [isNegativeSentiment=false]
 *   Pass true when the sentiment service has already determined the text
 *   carries a negative/fearful tone — used to elevate LOW → MEDIUM when no
 *   crime keyword was found.
 *
 * @returns {{ crime_type: string, severity: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL" }}
 */
const detectCrime = (text, isNegativeSentiment = false) => {
  const lowerText = text.toLowerCase();

  // Collect every matching crime type (duplicates removed via Set)
  const matchedCategories = new Set();

  for (const [keyword, category] of Object.entries(CRIME_KEYWORD_MAP)) {
    if (lowerText.includes(keyword)) {
      matchedCategories.add(category);
      logger.info(`crimeDetectionService → keyword matched: "${keyword}" → ${category}`);
    }
  }

  /* ── No keywords found ─────────────────────────────────────────────── */
  if (matchedCategories.size === 0) {
    const severity = isNegativeSentiment ? "MEDIUM" : "LOW";
    logger.info(
      `crimeDetectionService → no crime keyword found; severity=${severity}`
    );
    return { crime_type: "Unknown", severity };
  }

  /* ── Determine the primary crime type ──────────────────────────────── */
  // If multiple keywords matched, prefer the most severe category.
  // CRITICAL_CRIMES take priority; otherwise use the first match.
  let primaryCrime = [...matchedCategories][0];
  for (const crime of matchedCategories) {
    if (CRITICAL_CRIMES.has(crime)) {
      primaryCrime = crime;
      break;
    }
  }

  /* ── Assign severity ─────────────────────────────────────────────────── */
  let severity;
  if (CRITICAL_CRIMES.has(primaryCrime)) {
    severity = "CRITICAL";
  } else if (matchedCategories.size >= 2) {
    // Multiple distinct crime signals → escalate
    severity = "HIGH";
  } else {
    severity = "HIGH"; // single crime keyword is already high-risk
  }

  logger.info(
    `crimeDetectionService → crime_type=${primaryCrime}, severity=${severity}`
  );

  return { crime_type: primaryCrime, severity };
};

module.exports = { detectCrime };
