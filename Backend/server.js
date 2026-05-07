require("dotenv").config();

const http    = require("http");
const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");
const path    = require("path");

const { initSocket } = require("./socket");
const logger         = require("./utils/logger");
const errorHandler   = require("./middleware/errorHandler");

const analyzeRoutes   = require("./routes/analyzeRoutes");
const alertRoutes     = require("./routes/alertRoutes");
const heatmapRoutes   = require("./routes/heatmapRoutes");
const newsRoutes      = require("./routes/newsRoutes");
const whatsappRoutes  = require("./routes/whatsappRoutes");
const authorityRoutes = require("./routes/authorityRoutes");

const app  = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "http://127.0.0.1:5500", "null", "*"];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || origin === "null") return callback(null, true);
      if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      logger.warn(`CORS → blocked: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false,
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

app.use(express.static(path.join(__dirname, "..")));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status:    "ok",
    service:   "Sentinel AI",
    storage:   "local-json",
    ai_engine: "Llama 3 (Groq) + HuggingFace",
    modules:   ["fake-news", "whatsapp-bot", "authority-dashboard"],
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/analyze",    analyzeRoutes);
app.use("/api/alerts",     alertRoutes);
app.use("/api/heatmap",    heatmapRoutes);
app.use("/api/news",       newsRoutes);
app.use("/api",            newsRoutes);
app.use("/api/whatsapp",   whatsappRoutes);
app.use("/api/authority",  authorityRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found", status: 404 });
});

app.use(errorHandler);

const httpServer = http.createServer(app);
initSocket(httpServer);

httpServer.listen(PORT, "0.0.0.0", () => {
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  logger.info("  🛡  Sentinel AI server started");
  logger.info(`  🌐  http://0.0.0.0:${PORT}`);
  logger.info(`  🏥  Health: /health`);
  logger.info("  🤖  AI: Llama 3 (Groq) + HuggingFace");
  logger.info("  📱  WhatsApp Bot: /api/whatsapp/webhook");
  logger.info("  🏛️   Authority: /api/authority/login");
  logger.info("  📡  Socket.io ready");
  logger.info(`  🌍  ENV: ${process.env.NODE_ENV || "development"}`);
  logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
});

const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal} — shutting down…`);
  httpServer.close(() => { logger.info("Server closed."); process.exit(0); });
  setTimeout(() => process.exit(1), 10000);
};
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT",  () => gracefulShutdown("SIGINT"));

module.exports = app;
