/**
 * @file services/panicService.js
 * @description Computes the Sentinel AI Panic Index and orchestrates
 *              downstream actions (local file save, WhatsApp alert, Socket
 *              broadcast) when the index exceeds the critical threshold.
 *
 *              Panic Index formula
 *              ───────────────────
 *              panic_index = round(
 *                (fake_probability × 0.4) +
 *                (panic_score      × 0.4) +
 *                (virality_factor  × 0.2)
 *              )
 *
 *              Data is stored to data/alerts.json (local file — no database needed).
 *
 *              Actions taken when panic_index > PANIC_THRESHOLD (70)
 *              ────────────────────────────────────────────────────────
 *              1. Save alert to local JSON file via Alert model
 *              2. Send WhatsApp notification via Twilio
 *              3. Broadcast "new-alert" event over Socket.io
 *
 * @dependencies ../models/Alert, ../services/whatsappService,
 *               ../socket, ../utils/logger
 */

const Alert           = require("../models/Alert");
const whatsappService = require("./whatsappService");
const { emitAlert }   = require("../socket");
const logger          = require("../utils/logger");

/* ─── Constants ─────────────────────────────────────────────────────────── */

const PANIC_THRESHOLD        = 70;
const DEFAULT_VIRALITY_FACTOR = 85;

/* ─── Lightweight location extractor ────────────────────────────────────── */

const KNOWN_LOCATIONS = [
  "Bengaluru", "Bangalore", "Mumbai", "Delhi", "New Delhi", "Chennai",
  "Hyderabad", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow",
  "Surat", "Kanpur", "Nagpur", "Indore", "Thane", "Bhopal", "Patna",
  "Ludhiana", "Agra", "Nashik", "Vadodara", "Meerut", "Varanasi",
  "London", "New York", "Paris", "Berlin", "Tokyo", "Beijing",
  "Islamabad", "Kabul", "Kyiv", "Moscow",
];

/**
 * Scans the text for known city names (case-insensitive word boundary match).
 * Returns the first match or "Unknown" when nothing is found.
 *
 * @param {string} text
 * @returns {string}
 */
const extractLocation = (text) => {
  for (const city of KNOWN_LOCATIONS) {
    if (new RegExp(`\\b${city}\\b`, "i").test(text)) return city;
  }
  return "Unknown";
};

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Calculates the Panic Index and triggers downstream actions if warranted.
 *
 * @param {{
 *   text:             string,
 *   fake_probability: number,
 *   panic_score:      number,
 *   crime_type:       string,
 *   severity:         string,
 *   virality_factor?: number,
 * }} params
 *
 * @returns {Promise<{ panic_index: number, location: string, timestamp: string, alertSaved: boolean }>}
 */
const computePanicIndex = async ({
  text,
  fake_probability,
  panic_score,
  crime_type,
  severity,
  virality_factor = DEFAULT_VIRALITY_FACTOR,
}) => {
  /* ── 1. Compute the composite Panic Index ───────────────────────────── */
  const panic_index = Math.round(
    fake_probability * 0.4 +
    panic_score      * 0.4 +
    virality_factor  * 0.2
  );

  const location  = extractLocation(text);
  const timestamp = new Date().toISOString();

  logger.info(
    `panicService → panic_index=${panic_index} | location=${location} | threshold=${PANIC_THRESHOLD}`
  );

  let alertSaved = false;

  /* ── 2. Trigger actions only when threshold is exceeded ─────────────── */
  if (panic_index > PANIC_THRESHOLD) {
    logger.warn(
      `panicService → Panic Index ${panic_index} exceeds threshold — triggering alerts`
    );

    const alertData = {
      text, fake_probability, crime_type, severity,
      panic_score, panic_index, location, timestamp,
    };

    /* 2a. Save alert to local JSON file ─────────────────────────────── */
    try {
      Alert.create(alertData);
      alertSaved = true;
      logger.info("panicService → alert saved to local file store");
    } catch (fileErr) {
      logger.error(`panicService → failed to save alert: ${fileErr.message}`);
    }

    /* 2b. WhatsApp notification (non-fatal on failure) ──────────────── */
    await whatsappService.sendAlert(alertData);

    /* 2c. Socket.io broadcast ───────────────────────────────────────── */
    emitAlert({
      message:    `Possible ${crime_type} Rumor Detected`,
      location,
      severity,
      panic_index,
    });
  } else {
    logger.info(
      `panicService → Panic Index ${panic_index} below threshold — no alert triggered`
    );
  }

  return { panic_index, location, timestamp, alertSaved };
};

module.exports = { computePanicIndex };
