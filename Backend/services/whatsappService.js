const logger = require("../utils/logger");

let twilioClient = null;

const getClient = () => {
  if (twilioClient) return twilioClient;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error("Twilio credentials missing: set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN");
  }
  const twilio = require("twilio");
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return twilioClient;
};

const buildAlertMessage = ({ location, severity, fake_probability, crime_type, panic_index }) =>
  `⚠️ *SENTINEL AI ALERT*
━━━━━━━━━━━━━━━━━━━━
📍 Location      : ${location}
🚨 Risk Level    : ${severity}
🤖 Fake Prob.    : ${fake_probability}%
🔪 Crime Type    : ${crime_type}
📊 Panic Index   : ${panic_index}
━━━━━━━━━━━━━━━━━━━━
Stay safe. Verify before sharing.`;

const buildAnalysisReply = ({ title, fake_probability, severity, crime_type, reasoning, confidence, riskLabel, sourceUrl }) => {
  const riskEmoji = severity === "CRITICAL" ? "🔴" : severity === "HIGH" ? "🟠" : severity === "MEDIUM" ? "🟡" : "🟢";
  const verdict   = fake_probability >= 70 ? "⚠️ LIKELY FAKE / MISLEADING" :
                    fake_probability >= 40 ? "⚡ SUSPICIOUS — VERIFY" : "✅ APPEARS CREDIBLE";

  return `🛡️ *SENTINEL AI — FAKE NEWS CHECK*
━━━━━━━━━━━━━━━━━━━━━━━━━
📰 *Title:* ${title || "User Submitted Content"}

🔍 *Verdict:* ${verdict}
${riskEmoji} *Risk Level:* ${severity}
🤖 *Fake Probability:* ${fake_probability}%
🔐 *Confidence:* ${Math.round(confidence * 100)}%
🏷️ *Category:* ${crime_type}

💡 *AI Reasoning:*
_${reasoning || "Analysis completed by Sentinel AI."}_ 

${sourceUrl ? `🔗 *Source:* ${sourceUrl}\n` : ""}━━━━━━━━━━━━━━━━━━━━━━━━━
${fake_probability >= 70 ? "🚨 *This content has been flagged and sent to authorities for review.*" : "ℹ️ Always verify news from official sources."}

_Powered by Sentinel AI Cyber Intelligence Cell_`;
};

const buildWelcomeMessage = () =>
  `🛡️ *Welcome to SENTINEL AI*
_Cyber Intelligence & Fake News Detection Bot_
━━━━━━━━━━━━━━━━━━━━━━━━━

I can help you verify news content. Simply send me:

📝 *Text Message* — Paste any news text
🔗 *URL / Link* — Share a news article link
📷 *Image* — Send a screenshot with a caption describing it

I'll analyze it using AI and tell you if it's *fake, misleading, or real*.

_Type any news content to get started!_`;

const sendAlert = async (alertData) => {
  try {
    const client = getClient();
    const body   = buildAlertMessage(alertData);
    const from   = process.env.TWILIO_WHATSAPP_FROM;
    const to     = process.env.ALERT_PHONE_NUMBER;
    if (!from || !to) {
      logger.warn("whatsappService → TWILIO_WHATSAPP_FROM or ALERT_PHONE_NUMBER not set; skipping");
      return;
    }
    logger.info(`whatsappService → sending alert to ${to}…`);
    const message = await client.messages.create({ body, from, to });
    logger.info(`whatsappService → message sent (SID: ${message.sid})`);
  } catch (error) {
    logger.error(`whatsappService → failed to send alert: ${error.message}`);
  }
};

const sendMessage = async (to, body) => {
  try {
    const client = getClient();
    const from   = process.env.TWILIO_WHATSAPP_FROM || "whatsapp:+14155238886";
    if (!to) {
      logger.warn("whatsappService → no recipient — skipping sendMessage");
      return null;
    }
    logger.info(`whatsappService → sending message to ${to}…`);
    const message = await client.messages.create({ body, from, to });
    logger.info(`whatsappService → message sent (SID: ${message.sid})`);
    return message;
  } catch (error) {
    logger.error(`whatsappService → failed to send message: ${error.message}`);
    return null;
  }
};

module.exports = {
  sendAlert,
  sendMessage,
  buildAnalysisReply,
  buildWelcomeMessage,
};
