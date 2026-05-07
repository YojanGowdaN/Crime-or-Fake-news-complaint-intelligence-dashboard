/**
 * @file middleware/errorHandler.js
 * @description Global Express error-handling middleware for Sentinel AI.
 *
 *              Must be registered AFTER all routes in server.js:
 *                app.use(errorHandler);
 *
 *              Behaviour
 *              ─────────
 *              • Logs the full stack trace via Winston (not console.log)
 *              • Returns a clean JSON error body so clients always receive
 *                a predictable shape regardless of where the error occurred
 *              • Strips stack traces from production responses to avoid
 *                leaking internal implementation details
 *
 *              Response shape
 *              ──────────────
 *              {
 *                "error":  "Human-readable message",
 *                "status": 500
 *              }
 *
 * @dependencies ../utils/logger
 */

const logger = require("../utils/logger");

/**
 * Express error handler.
 * The four-parameter signature is mandatory — Express identifies error
 * middleware by arity and will skip this function if `err` is omitted.
 *
 * @param {Error}             err  - The error object thrown or passed to next()
 * @param {import('express').Request}  req  - Express request
 * @param {import('express').Response} res  - Express response
 * @param {import('express').NextFunction} next - Express next (required by spec, unused)
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  /* ── 1. Determine HTTP status code ─────────────────────────────────────
   *   Use the status that was explicitly set on the error object (useful
   *   for 400/404/422 errors thrown from controllers), otherwise default
   *   to 500 Internal Server Error.
   */
  const statusCode = err.status || err.statusCode || 500;

  /* ── 2. Log the error with as much context as possible ─────────────── */
  logger.error(
    `[${req.method}] ${req.originalUrl} → ${statusCode}: ${err.message}`,
    { stack: err.stack }
  );

  /* ── 3. Build the response body ─────────────────────────────────────── */
  const body = {
    error:  err.message || "An unexpected error occurred",
    status: statusCode,
  };

  // Include the stack trace only during local development — never in prod
  if (process.env.NODE_ENV === "development") {
    body.stack = err.stack;
  }

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
