/**
 * server.js — Sentinel WhatsApp Bot Entry Point
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Starts two things in parallel:
 *   1. An Express REST API (for /health, /check-news, /alert-authority)
 *   2. A Baileys WhatsApp client that prints a QR code and connects
 *
 * How to run:
 *   npm install
 *   node server.js        (or: npm start)
 *   nodemon server.js     (for auto-restart during development)
 *
 * On first run, scan the QR code that appears in your terminal with the
 * WhatsApp app on your phone (Linked Devices → Link a Device).
 * Your session is saved in auth_info_baileys/ — future restarts will NOT
 * show the QR code again unless you delete that folder.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Load environment variables from .env file first
require("dotenv").config();

const express    = require("express");
const newsRoutes = require("./routes/news");
const logger     = require("./utils/logger");
const whatsapp   = require("./bot/whatsapp");

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Basic CORS — allows the Sentinel dashboard to call /check-news directly
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (_req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/", newsRoutes);

// 404 catch-all
app.use((_req, res) => res.status(404).json({ error: "Route not found" }));

// Global error handler
app.use((err, _req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(err.status || 500).json({ error: err.message || "Internal server error" });
});

// ── Start Express ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("  🤖  Sentinel WhatsApp Bot Server");
  logger.info(`  🌐  REST API → http://localhost:${PORT}`);
  logger.info(`  📋  Health   → http://localhost:${PORT}/health`);
  logger.info(`  📰  Analyse  → POST http://localhost:${PORT}/check-news`);
  logger.info(`  🚔  Alert    → POST http://localhost:${PORT}/alert-authority`);
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

// ── Start WhatsApp Bot ──────────────────────────────────────────────────────
(async () => {
  try {
    logger.info("WhatsApp → Starting browser session (first time takes ~30s to download)…");
    await whatsapp.connect();
  } catch (err) {
    logger.error(`WhatsApp → Failed to start: ${err.message}`);
    setTimeout(() => whatsapp.connect().catch(e => logger.error(e.message)), 10_000);
  }
})();

// ── Graceful shutdown ───────────────────────────────────────────────────────
const shutdown = (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  process.exit(0);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("uncaughtException",  (err) => logger.error(`Uncaught: ${err.message}`));
process.on("unhandledRejection", (err) => logger.error(`Unhandled: ${err}`));
