/**
 * @file server.js
 * @description Entry point for the Sentinel AI backend.
 *
 *              No database server required — data stored in data/alerts.json.
 *
 *              Startup sequence
 *              ────────────────
 *              1. Load .env
 *              2. Create Express app + global middleware
 *              3. Mount API routers
 *              4. Attach global error handler
 *              5. Create HTTP server → attach Socket.io
 *              6. Start listening on PORT
 *
 * @dependencies express, http, dotenv, cors, helmet,
 *               ./socket, ./routes/*, ./middleware/errorHandler, ./utils/logger
 */

require("dotenv").config();

const http    = require("http");
const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");

const { initSocket } = require("./socket");
const logger         = require("./utils/logger");
const errorHandler   = require("./middleware/errorHandler");

/* ── Route modules ───────────────────────────────────────────────────────── */
const analyzeRoutes = require("./routes/analyzeRoutes");
const alertRoutes   = require("./routes/alertRoutes");
const heatmapRoutes = require("./routes/heatmapRoutes");
const newsRoutes    = require("./routes/newsRoutes");

/* ─────────────────────────────────────────────────────────────────────────── */

const app  = express();
const PORT = process.env.PORT || 5000;

/* ── CORS ─────────────────────────────────────────────────────────────────── */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "http://127.0.0.1:5500", "null"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow curl, Postman, file:// (origin = null), and configured origins
      if (!origin || origin === "null") return callback(null, true);
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        return callback(null, true);
      }
      logger.warn(`CORS → blocked request from: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    },
    credentials: true,
  })
);

/* ── Security headers ────────────────────────────────────────────────────── */
// Relax CSP so the frontend served from a file:// URL can still connect
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

/* ── Body parsers ────────────────────────────────────────────────────────── */
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

/* ── Health check ────────────────────────────────────────────────────────── */
app.get("/health", (_req, res) => {
  res.status(200).json({
    status:    "ok",
    service:   "Sentinel AI",
    storage:   "local-json",
    ai_engine: "Llama 3 (Groq) + HuggingFace",
    timestamp: new Date().toISOString(),
  });
});

/* ── API routes ──────────────────────────────────────────────────────────── */
app.use("/api/analyze",    analyzeRoutes);
app.use("/api/alerts",     alertRoutes);
app.use("/api/heatmap",    heatmapRoutes);
app.use("/api/news",       newsRoutes);
app.use("/api",            newsRoutes); // /api/complaints lives on newsRoutes

/* ── 404 ─────────────────────────────────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found", status: 404 });
});

/* ── Global error handler ────────────────────────────────────────────────── */
app.use(errorHandler);

/* ── HTTP server + Socket.io ─────────────────────────────────────────────── */
const httpServer = http.createServer(app);
initSocket(httpServer);

/* ── Start ───────────────────────────────────────────────────────────────── */
httpServer.listen(PORT, () => {
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("  🛡  Sentinel AI server started");
  logger.info(`  🌐  http://localhost:${PORT}`);
  logger.info(`  🏥  Health: http://localhost:${PORT}/health`);
  logger.info("  🤖  AI: Llama 3 (Groq) + HuggingFace");
  logger.info("  💾  Storage: data/alerts.json (local file)");
  logger.info("  📡  Socket.io ready");
  logger.info(`  🌍  ENV: ${process.env.NODE_ENV || "development"}`);
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

/* ── Graceful shutdown ───────────────────────────────────────────────────── */
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal} — shutting down gracefully…`);
  httpServer.close(() => { logger.info("Server closed."); process.exit(0); });
  setTimeout(() => process.exit(1), 10000);
};
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

module.exports = app;
