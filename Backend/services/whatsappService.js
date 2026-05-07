/**
 * @file services/whatsappService.js
 * @description Sends real-time WhatsApp alert messages via the Twilio API
 *              whenever the Panic Index crosses the critical threshold.
 *
 *              Design decisions
 *              ────────────────
 *              • The Twilio client is initialised lazily (on first call)
 *                so that the server can boot even when Twilio credentials
 *                are missing (useful in local dev / CI).
 *              • All errors are caught and logged — a WhatsApp failure must
 *                NEVER propagate upward and crash the analysis pipeline.
 *              • The message template is self-contained in this file so it
 *                can be updated without touching controller logic.
 *
 *              Required environment variables
 *              ───────────────────────────────
 *              TWILIO_ACCOUNT_SID     – Twilio account identifier (AC…)
 *              TWILIO_AUTH_TOKEN      – Twilio auth token
 *              TWILIO_WHATSAPP_FROM   – sender number, e.g. whatsapp:+14155238886
 *              ALERT_PHONE_NUMBER     – recipient number, e.g. whatsapp:+91XXXXXXXXXX
 *
 * @dependencies twilio, ../utils/logger
 */

const logger = require("../utils/logger");

/* ─── Lazy Twilio client ─────────────────────────────────────────────────── */

let twilioClient = null;

/**
 * Returns (and caches) a Twilio REST client.
 * Throws a clear error if credentials are missing.
 *
 * @returns {import('twilio').Twilio}
 */
const getClient = () => {
  if (twilioClient) return twilioClient;

  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error(
      "Twilio credentials missing: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env"
    );
  }

  // Require twilio here so the app boots without it if credentials are absent
  const twilio   = require("twilio");
  twilioClient   = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return twilioClient;
};

/* ─── Message builder ────────────────────────────────────────────────────── */

/**
 * Formats the WhatsApp alert message from alert data fields.
 *
 * @param {{ location: string, severity: string, fake_probability: number,
 *           crime_type: string, panic_index: number }} alertData
 * @returns {string} Formatted message body
 */
const buildMessage = ({ location, severity, fake_probability, crime_type, panic_index }) =>
  `⚠️ SENTINEL AI ALERT
━━━━━━━━━━━━━━━━━━━━
📍 Location      : ${location}
🚨 Risk Level    : ${severity}
🤖 Fake Prob.    : ${fake_probability}%
🔪 Crime Type    : ${crime_type}
📊 Panic Index   : ${panic_index}
━━━━━━━━━━━━━━━━━━━━
Stay safe. Verify before sharing.`;

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Sends a WhatsApp alert message to the configured recipient.
 *
 * Errors are swallowed after logging — callers MUST NOT await this function
 * in a way that would propagate failures.  The recommended pattern is:
 *
 *   await whatsappService.sendAlert(data);  // safe — errors are caught internally
 *
 * @param {{ location: string, severity: string, fake_probability: number,
 *           crime_type: string, panic_index: number }} alertData
 * @returns {Promise<void>}
 */
const sendAlert = async (alertData) => {
  try {
    const client  = getClient();
    const body    = buildMessage(alertData);
    const from    = process.env.TWILIO_WHATSAPP_FROM;
    const to      = process.env.ALERT_PHONE_NUMBER;

    if (!from || !to) {
      logger.warn(
        "whatsappService → TWILIO_WHATSAPP_FROM or ALERT_PHONE_NUMBER not set; skipping WhatsApp send"
      );
      return;
    }

    logger.info(`whatsappService → sending alert to ${to}…`);

    const message = await client.messages.create({ body, from, to });

    logger.info(
      `whatsappService → message sent successfully (SID: ${message.sid})`
    );
  } catch (error) {
    // Log but do NOT re-throw — WhatsApp failure is non-fatal
    logger.error(`whatsappService → failed to send WhatsApp alert: ${error.message}`);
  }
};

module.exports = { sendAlert };
