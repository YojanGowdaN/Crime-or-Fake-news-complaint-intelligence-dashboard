/**
 * @file controllers/alertController.js
 * @description Handles retrieval of persisted alert documents.
 *
 *              Data source: local JSON file (data/alerts.json)
 *              No database connection required.
 *
 *              GET /api/alerts returns only HIGH and CRITICAL severity alerts,
 *              sorted newest-first, with optional pagination via query params.
 *
 * @dependencies ../models/Alert, ../utils/logger
 */

const Alert  = require("../models/Alert");
const logger = require("../utils/logger");

/**
 * GET /api/alerts
 *
 * Query parameters (all optional)
 * ─────────────────────────────────
 * limit  {number}  Max results to return (default: 50, max: 200)
 * skip   {number}  Results to skip for pagination (default: 0)
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getAlerts = (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip  = parseInt(req.query.skip,  10) || 0;

    logger.info(`alertController → fetching alerts (limit=${limit}, skip=${skip})`);

    const alerts = Alert.findHighCritical({ limit, skip });

    logger.info(`alertController → returned ${alerts.length} alert(s)`);
    res.status(200).json(alerts);
  } catch (error) {
    next(error);
  }
};

module.exports = { getAlerts };
