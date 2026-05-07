/**
 * @file models/Alert.js
 * @description Alert model — backed by local JSON file storage.
 *
 *              All numeric scores stored and returned as integers 0-100.
 */

const store = require("../utils/store");

const VALID_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

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

/**
 * Persists a new alert document.
 * @param {Object} doc
 * @returns {Object}
 */
const create = (doc) => {
  validate(doc);
  return store.create({
    text:             doc.text.trim().slice(0, 2000),
    fake_probability: doc.fake_probability,   // integer 0-100
    is_fake:          doc.fake_probability > 50,
    crime_type:       doc.crime_type  || "Unknown",
    severity:         doc.severity,           // uppercase: HIGH | CRITICAL | MEDIUM | LOW
    panic_score:      doc.panic_score  || 0,
    panic_index:      doc.panic_index  || 0,
    location:         doc.location    || "Unknown",
    timestamp:        doc.timestamp   || new Date().toISOString(),
  });
};

/**
 * Returns HIGH and CRITICAL alerts, newest first.
 * Severity is lowercased for the frontend.
 */
const findHighCritical = ({ limit = 50, skip = 0 } = {}) => {
  const raw = store.find(
    (doc) => doc.severity === "HIGH" || doc.severity === "CRITICAL",
    { limit, skip }
  );
  return raw.map(normalise);
};

/**
 * Returns all alerts (used by heatmap aggregation — keeps uppercase severity).
 */
const findAll = (limit = 500) => store.findAll(limit);

/**
 * Normalises a stored alert for the frontend:
 * - Lowercases severity (frontend does this too, but belt-and-braces)
 * - Keeps fake_probability as integer 0-100 (frontend displays as ${prob}%)
 */
const normalise = (doc) => ({
  ...doc,
  severity: (doc.severity || "medium").toLowerCase(),
  is_fake:  doc.is_fake !== undefined ? doc.is_fake : (doc.fake_probability || 0) > 50,
});

module.exports = { create, findHighCritical, findAll, normalise };
