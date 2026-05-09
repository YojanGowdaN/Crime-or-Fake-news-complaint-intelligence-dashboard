/**
 * utils/rateLimiter.js
 * Per-sender in-memory rate limiter.
 *
 * Prevents spam: if a WhatsApp number sends more than MAX messages
 * within WINDOW_MS milliseconds, further messages are silently ignored.
 *
 * This is separate from Express rate limiting (which protects the REST API).
 */

const logger = require("./logger");

const MAX    = parseInt(process.env.RATE_LIMIT_MAX,       10) || 10;
const WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000; // 1 minute

// Map: senderId → { count, windowStart }
const senderMap = new Map();

/**
 * Check if a sender is allowed to send another message.
 * @param {string} senderId  — WhatsApp JID (e.g. "919876543210@s.whatsapp.net")
 * @returns {boolean} true = allowed, false = rate-limited
 */
const isAllowed = (senderId) => {
  const now = Date.now();
  const entry = senderMap.get(senderId);

  if (!entry || now - entry.windowStart > WINDOW) {
    // Fresh window
    senderMap.set(senderId, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= MAX) {
    logger.warn(`rateLimiter → ${senderId} exceeded ${MAX} msgs/min — throttled`);
    return false;
  }

  entry.count++;
  return true;
};

// Clean up old entries every minute to avoid memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of senderMap.entries()) {
    if (now - entry.windowStart > WINDOW) senderMap.delete(id);
  }
}, WINDOW);

module.exports = { isAllowed };
