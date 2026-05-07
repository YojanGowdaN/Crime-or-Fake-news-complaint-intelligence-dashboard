/**
 * @file utils/logger.js
 * @description Centralised Winston logger for Sentinel AI.
 *              Provides three log levels:
 *                - info  → normal operational messages
 *                - warn  → recoverable issues / degraded-mode fallbacks
 *                - error → unhandled exceptions, failed external calls
 *
 *              In production the JSON format is emitted so log-aggregation
 *              tools (Datadog, Papertrail, etc.) can parse it automatically.
 *              In development a human-readable colourised format is used.
 *
 * @dependencies winston
 */

const { createLogger, format, transports } = require("winston");

const { combine, timestamp, printf, colorize, errors } = format;

/* ─── Custom human-readable format for development ─────────────────────── */
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  errors({ stack: true }),          // print stack traces when an Error is logged
  printf(({ level, message, timestamp, stack }) => {
    // If a stack trace exists (i.e. an Error object was logged), show it
    return stack
      ? `[${timestamp}] ${level}: ${message}\n${stack}`
      : `[${timestamp}] ${level}: ${message}`;
  })
);

/* ─── Structured JSON format for production / log shippers ─────────────── */
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  format.json()
);

const isProduction = process.env.NODE_ENV === "production";

const logger = createLogger({
  level: isProduction ? "warn" : "info",   // only warn/error in production
  format: isProduction ? prodFormat : devFormat,
  transports: [
    new transports.Console(),
    // Uncomment the lines below to also write logs to files:
    // new transports.File({ filename: "logs/error.log",  level: "error" }),
    // new transports.File({ filename: "logs/combined.log" }),
  ],
  // Prevent Winston from crashing the process on uncaught exceptions
  exitOnError: false,
});

module.exports = logger;
