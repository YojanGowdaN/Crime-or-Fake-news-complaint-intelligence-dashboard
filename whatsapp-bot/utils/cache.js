/**
 * utils/cache.js
 * Simple in-memory key-value cache with TTL (time-to-live).
 *
 * Why: Avoid re-analysing the exact same message/URL repeatedly.
 * The cache auto-expires entries after CACHE_TTL_MS milliseconds.
 */

const logger = require("./logger");

// TTL from env, default 10 minutes
const TTL = parseInt(process.env.CACHE_TTL_MS, 10) || 600_000;

// Internal store: key → { value, expiresAt }
const store = new Map();

/**
 * Get a cached value. Returns null if missing or expired.
 */
const get = (key) => {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
};

/**
 * Store a value with the default TTL.
 */
const set = (key, value, ttl = TTL) => {
  store.set(key, { value, expiresAt: Date.now() + ttl });
};

/**
 * Remove stale entries. Called periodically to avoid memory leaks.
 */
const purge = () => {
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) { store.delete(key); removed++; }
  }
  if (removed > 0) logger.debug(`cache → purged ${removed} stale entries`);
};

// Purge every 5 minutes automatically
setInterval(purge, 300_000);

module.exports = { get, set, size: () => store.size };
