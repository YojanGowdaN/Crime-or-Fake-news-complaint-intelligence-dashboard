/**
 * bot/whatsapp.js
 * WhatsApp connection using whatsapp-web.js (Puppeteer-based).
 *
 * Features:
 *  - QR code printed to terminal on first run — scan once with your phone
 *  - Session saved to ./.wwebjs_auth/ (persists across restarts — no re-scan needed)
 *  - Auto-reconnect if the connection drops
 *  - Handles text, URL, and image caption messages
 *  - Per-sender rate limiting
 *  - Fake news analysis + formatted reply with emojis
 *  - Auto-alerts authority when confidence > threshold
 */

const qrcode          = require("qrcode-terminal");
const logger          = require("../utils/logger");
const rateLimiter     = require("../utils/rateLimiter");
const { extractUrls, getMessageType } = require("../utils/urlDetector");
const fakeNewsService = require("../services/fakeNewsService");
const alertService    = require("../services/alertService");

let client = null;

const connect = async () => {
  const { Client, LocalAuth } = require("whatsapp-web.js");

  client = new Client({
    authStrategy: new LocalAuth({ dataPath: ".wwebjs_auth" }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--disable-gpu",
      ],
    },
  });

  // ── QR code ───────────────────────────────────────────────────────────────
  client.on("qr", (qr) => {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("  📱  SCAN THIS QR CODE WITH WHATSAPP");
    logger.info("  WhatsApp → ⋮ Menu → Linked Devices → Link a Device");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    qrcode.generate(qr, { small: true });
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info("  ⏳ Waiting for you to scan… (QR refreshes every 20s if not scanned)");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  });

  // ── Ready ─────────────────────────────────────────────────────────────────
  client.on("ready", () => {
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    logger.info(`  ✅ WhatsApp connected! (as ${client.info?.pushname || "Sentinel Bot"})`);
    logger.info("  🤖 Bot is online and receiving messages.");
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  });

  // ── Auth failure ──────────────────────────────────────────────────────────
  client.on("auth_failure", (msg) => {
    logger.error(`WhatsApp auth failed: ${msg}`);
    logger.warn("Delete .wwebjs_auth/ folder and restart to re-scan QR.");
  });

  // ── Disconnected ──────────────────────────────────────────────────────────
  client.on("disconnected", (reason) => {
    logger.warn(`WhatsApp disconnected: ${reason}. Reconnecting in 10s…`);
    setTimeout(() => {
      client.destroy().then(connect).catch(() => connect());
    }, 10000);
  });

  // ── Incoming messages ─────────────────────────────────────────────────────
  client.on("message", async (msg) => {
    await handleMessage(msg);
  });

  // ── Start ─────────────────────────────────────────────────────────────────
  logger.info("WhatsApp → Starting browser session (this may take 15-30 seconds)…");
  await client.initialize();
};

/**
 * Handle a single incoming WhatsApp message.
 */
const handleMessage = async (msg) => {
  try {
    if (msg.fromMe) return;

    const sender = msg.from;
    if (!sender) return;

    // Ignore WhatsApp Status/Story broadcasts — not real chat messages
    if (sender === "status@broadcast") return;
    if (sender.endsWith("@broadcast")) return;

    // Rate limiting
    if (!rateLimiter.isAllowed(sender)) {
      logger.warn(`bot → rate-limited: ${sender}`);
      return;
    }

    const text     = msg.body || "";
    const hasImage = msg.hasMedia && msg.type === "image";

    if (!text && !hasImage) return;

    const displayText = text || "[Image received — caption analysis]";
    const msgType     = getMessageType(text, hasImage);

    logger.info(`bot → msg from ${sender} | type=${msgType} | len=${text.length}`);

    // Typing indicator
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    // Analyse
    const analysis = await fakeNewsService.analyse(text || "Image message", msgType);

    // Auto-alert if high confidence
    if (analysis.confidence >= fakeNewsService.THRESHOLD) {
      logger.warn(`bot → HIGH confidence (${analysis.confidence}%) — alerting authority`);
      await alertService.alertAuthority({ content: displayText, sender, analysis });
    }

    // Reply
    const reply = formatReply(analysis, msgType, text);
    await msg.reply(reply);

    logger.info(`bot → replied to ${sender} | verdict=${analysis.status}`);
  } catch (err) {
    logger.error(`bot → message handler error: ${err.message}`);
  }
};

/**
 * Format the WhatsApp reply with emojis and clear sections.
 */
const formatReply = (analysis, msgType, originalText) => {
  const { status, confidence, reason, crimeType, panicIndex } = analysis;

  const isFake     = status === "FAKE";
  const statusLine = isFake ? "🚨 *FAKE NEWS DETECTED*" : "✅ *NEWS APPEARS REAL*";
  const confBar    = buildConfidenceBar(confidence);
  const typeIcon   = msgType === "url" ? "🔗 Link" : msgType === "image" ? "🖼️ Image" : "📝 Text";

  const urls    = extractUrls(originalText || "");
  const urlLine = urls.length ? `\n🌐 *URL:* ${urls[0].slice(0, 60)}${urls[0].length > 60 ? "…" : ""}` : "";

  let out = `${statusLine}\n`;
  out += `━━━━━━━━━━━━━━━━━━━━\n`;
  out += `📊 *Confidence:* ${confidence}%\n`;
  out += `${confBar}\n`;
  out += `📌 *Type:* ${typeIcon}${urlLine}\n`;
  if (crimeType && crimeType !== "Unknown") out += `⚠️ *Category:* ${crimeType}\n`;
  if (panicIndex > 50) out += `📈 *Panic Index:* ${panicIndex}/100\n`;
  out += `━━━━━━━━━━━━━━━━━━━━\n`;
  out += `💡 *AI Analysis:*\n${reason}\n`;
  out += `━━━━━━━━━━━━━━━━━━━━\n`;

  if (isFake) {
    out += `\n🛡️ *What to do:*\n`;
    out += `◦ Do NOT forward this message\n`;
    out += `◦ Check: PIB Fact Check, AltNews, Boom\n`;
    if (confidence >= fakeNewsService.THRESHOLD) {
      out += `\n🚔 *Auto-Alert:* Authorities have been notified.\n`;
    }
  } else {
    out += `\n✨ Always verify from multiple trusted sources before sharing.\n`;
  }

  out += `\n_Powered by Sentinel AI 🛡️_`;
  return out;
};

const buildConfidenceBar = (pct) => {
  const filled = Math.round(pct / 10);
  return `[${"█".repeat(filled)}${"░".repeat(10 - filled)}] ${pct}%`;
};

const getClient = () => client;

module.exports = { connect, getClient };
