/**
 * services/alertService.js
 * Automatically alerts the authority when fake news confidence exceeds
 * the configured threshold (default 90%).
 *
 * Sends to:
 *   POST /api/complaints  on the Sentinel backend (saves to authority dashboard)
 *   POST /alert-authority on this same Express server (internal endpoint)
 */

const axios  = require("axios");
const logger = require("../utils/logger");

const BASE_URL = process.env.SENTINEL_API_URL || "http://localhost:5000";

/**
 * Alert the authority about high-confidence fake news.
 * @param {object} payload
 * @param {string} payload.content   — original message text
 * @param {string} payload.sender    — WhatsApp JID of the sender
 * @param {object} payload.analysis  — result from fakeNewsService.analyse()
 */
const alertAuthority = async ({ content, sender, analysis }) => {
  const payload = {
    text:      `[WhatsApp Bot Alert]\nSender: ${sender}\nContent: ${content.slice(0, 500)}`,
    location:  "WhatsApp",
    source:    "whatsapp-bot",
    confidence: analysis.confidence,
    crimeType:  analysis.crimeType,
    severity:   analysis.severity,
  };

  try {
    await axios.post(`${BASE_URL}/api/complaints`, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10_000,
    });
    logger.info(`alertService → authority complaint filed for sender ${sender}`);
  } catch (err) {
    logger.error(`alertService → failed to file complaint: ${err.message}`);
  }
};

module.exports = { alertAuthority };
