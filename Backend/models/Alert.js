/**
 * @file models/Alert.js
 * @description Alert model for Sentinel AI — backed by local JSON file storage.
 *
 *              Persists data to data/alerts.json on the local device.
 *              No database server or connection string is needed.
 *
 *              Document shape
 *              ──────────────
 *              id               – unique hex string (auto-generated)
 *              text             – original input text
 *              fake_probability – 0-100 score from HuggingFace
 *              crime_type       – detected crime category
 *              severity         – LOW | MEDIUM | HIGH | CRITICAL
 *              panic_score      – 0-100 sentiment panic score
 *              panic_index      – composite Panic Index value
 *              location         – extracted city / region string
 *              timestamp        – ISO 8601 analysis timestamp
 *              createdAt        – ISO 8601 file-write timestamp (auto)
 *
 * @dependencies ../utils/store
 */

const store = require("../utils/store");

/**
 * Valid severity levels — used for input validation in create().
 */
const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

/**
 * Validates an alert document before saving.
 * Throws a descriptive Error if any required field is missing or invalid.
 *
 * @param {Object} doc
 */
const validate = (doc) => {
  if (!doc.text || typeof doc.text !== "string") {
    throw new Error("Alert.text is required and must be a string");
  }
  if (typeof doc.fake_probability !== "number") {
    throw new Error("Alert.fake_probability must be a number");
  }
  if (!VALID_SEVERITIES.includes(doc.severity)) {
    throw new Error(`Alert.severity must be one of: ${VALID_SEVERITIES.join(", ")}`);
  }
};

/* ─── Public Model API ───────────────────────────────────────────────────── */

/**
 * Persists a new alert document.
 *
 * @param {Object} doc - Alert fields
 * @returns {Object} The saved document with generated `id` and `createdAt`
 */
const create = (doc) => {
  validate(doc);

  return store.create({
    text:             doc.text.trim().slice(0, 2000),
    fake_probability: doc.fake_probability,
    crime_type:       doc.crime_type  || "Unknown",
    severity:         doc.severity,
    panic_score:      doc.panic_score  || 0,
    panic_index:      doc.panic_index  || 0,
    location:         doc.location    || "Unknown",
    timestamp:        doc.timestamp   || new Date().toISOString(),
  });
};

/**
 * Returns HIGH and CRITICAL alerts, newest first.
 *
 * @param {{ limit?: number, skip?: number }} options
 * @returns {Array<Object>}
 */
const findHighCritical = ({ limit = 50, skip = 0 } = {}) => {
  return store.find(
    (doc) => doc.severity === "HIGH" || doc.severity === "CRITICAL",
    { limit, skip }
  );
};

/**
 * Returns all alerts (used by the heatmap aggregation).
 *
 * @param {number} [limit=500]
 * @returns {Array<Object>}
 */
const findAll = (limit = 500) => store.findAll(limit);

module.exports = { create, findHighCritical, findAll };
