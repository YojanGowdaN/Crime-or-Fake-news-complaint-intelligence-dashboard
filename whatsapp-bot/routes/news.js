/**
 * routes/news.js
 * REST API endpoints exposed by the WhatsApp bot server.
 *
 * GET  /health        — health check
 * POST /check-news    — manually analyse a piece of text/URL
 * POST /alert-authority — internal endpoint to log an authority alert
 */

const express         = require("express");
const rateLimit       = require("express-rate-limit");
const router          = express.Router();
const fakeNewsService = require("../services/fakeNewsService");
const alertService    = require("../services/alertService");
const logger          = require("../utils/logger");
const { getSocket }   = require("../bot/whatsapp");

// Rate limit REST API: 30 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60_000,
  max:      30,
  message:  { error: "Too many requests. Please slow down." },
});

/* ── GET /health ──────────────────────────────────────────────────────────── */
router.get("/health", (_req, res) => {
  const socket     = getSocket();
  const waStatus   = socket?.user ? "connected" : "disconnected";

  res.json({
    status:      "ok",
    service:     "Sentinel WhatsApp Bot",
    whatsapp:    waStatus,
    connectedAs: socket?.user?.id || null,
    timestamp:   new Date().toISOString(),
  });
});

/* ── POST /check-news ─────────────────────────────────────────────────────── */
// Manually analyse text or a URL (useful for testing without WhatsApp)
router.post("/check-news", apiLimiter, async (req, res) => {
  try {
    const { text, url } = req.body;
    const content = text || url;

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return res.status(400).json({ error: "'text' or 'url' field is required" });
    }

    const msgType  = url ? "url" : "text";
    const analysis = await fakeNewsService.analyse(content.trim(), msgType);

    logger.info(`/check-news → ${analysis.status} (${analysis.confidence}%)`);

    res.json({
      success: true,
      input:   content.slice(0, 100),
      ...analysis,
    });
  } catch (err) {
    logger.error(`/check-news error: ${err.message}`);
    res.status(500).json({ error: "Analysis failed", detail: err.message });
  }
});

/* ── POST /alert-authority ────────────────────────────────────────────────── */
// Internal endpoint called when confidence exceeds the threshold
router.post("/alert-authority", apiLimiter, async (req, res) => {
  try {
    const { content, sender, timestamp, confidence, reason } = req.body;

    if (!content || !sender) {
      return res.status(400).json({ error: "'content' and 'sender' are required" });
    }

    logger.warn(`/alert-authority → high-confidence fake news from ${sender} (${confidence}%)`);

    // Forward to Sentinel backend complaint system
    await alertService.alertAuthority({
      content,
      sender,
      analysis: { confidence, reason, crimeType: "FakeNews", severity: "HIGH" },
    });

    res.json({
      success:   true,
      message:   "Authority has been alerted",
      sender,
      timestamp: timestamp || new Date().toISOString(),
    });
  } catch (err) {
    logger.error(`/alert-authority error: ${err.message}`);
    res.status(500).json({ error: "Alert failed", detail: err.message });
  }
});

module.exports = router;
