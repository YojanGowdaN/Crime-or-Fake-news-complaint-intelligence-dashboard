/**
 * @file utils/store.js
 * @description Lightweight local JSON file store for Sentinel AI.
 *
 *              All alert documents are persisted to `data/alerts.json` on the
 *              local device. Reads and writes are synchronised through a simple
 *              in-memory cache so the file is not re-read on every query.
 *
 *              API
 *              ───
 *              store.create(doc)          → saved doc with generated id + timestamps
 *              store.find(filterFn)       → array of matching docs
 *              store.findAll()            → all docs, newest first
 *
 *              Storage format
 *              ──────────────
 *              A plain JSON array written to  /data/alerts.json
 *              Each document has an `id` (UUID v4-style), `createdAt`, and all
 *              the Alert fields from the analysis pipeline.
 *
 * @dependencies fs, path, crypto, ../utils/logger
 */

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const logger = require("./logger");

/* ─── File path ──────────────────────────────────────────────────────────── */
const DATA_FILE = path.join(__dirname, "../data/alerts.json");

/* ─── In-memory cache ────────────────────────────────────────────────────── */
// Populated on first access; kept in sync on every write.
let _cache = null;

/* ─── Internal helpers ───────────────────────────────────────────────────── */

/**
 * Reads the JSON file and populates the cache.
 * If the file is missing or corrupt, starts with an empty array.
 *
 * @returns {Array<Object>}
 */
const _load = () => {
  if (_cache !== null) return _cache;

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    _cache = JSON.parse(raw);
    logger.info(`store → loaded ${_cache.length} alert(s) from disk`);
  } catch (err) {
    // File doesn't exist yet or is empty — that's fine on first run
    logger.warn(`store → could not read ${DATA_FILE}: ${err.message} — starting fresh`);
    _cache = [];
  }

  return _cache;
};

/**
 * Writes the current cache back to disk atomically.
 * Uses a temp file + rename to avoid partial writes on crash.
 */
const _persist = () => {
  const tmp = `${DATA_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(_cache, null, 2), "utf8");
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    logger.error(`store → failed to write ${DATA_FILE}: ${err.message}`);
    throw err;
  }
};

/**
 * Generates a short unique ID (16 hex chars) for each document.
 * @returns {string}
 */
const _generateId = () => crypto.randomBytes(8).toString("hex");

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Saves a new alert document to the store.
 *
 * @param {Object} doc - The alert fields to persist
 * @returns {Object} The saved document (with `id` and `createdAt` added)
 */
const create = (doc) => {
  _load(); // ensure cache is warm

  const saved = {
    id:        _generateId(),
    createdAt: new Date().toISOString(),
    ...doc,
  };

  _cache.unshift(saved); // newest first
  _persist();

  logger.info(`store → alert saved (id: ${saved.id})`);
  return saved;
};

/**
 * Returns all documents that pass the optional filter function.
 * Defaults to returning every document if no filter is provided.
 *
 * @param {function(Object): boolean} [filterFn] - Optional predicate
 * @param {{ limit?: number, skip?: number }} [options]
 * @returns {Array<Object>}
 */
const find = (filterFn = () => true, { limit = 200, skip = 0 } = {}) => {
  const data = _load();
  const filtered = data.filter(filterFn);
  return filtered.slice(skip, skip + limit);
};

/**
 * Returns every stored alert (newest first, no pagination).
 * Primarily used by the heatmap aggregation.
 *
 * @param {number} [limit=500]
 * @returns {Array<Object>}
 */
const findAll = (limit = 500) => {
  const data = _load();
  return data.slice(0, limit);
};

module.exports = { create, find, findAll };
