const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const logger = require("./logger");

const REPORTS_FILE = path.join(__dirname, "../data/reports.json");
const CASES_FILE   = path.join(__dirname, "../data/cases.json");

let _reportsCache = null;
let _casesCache   = null;

const _generateId = (prefix = "RPT") =>
  `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

/* ─── REPORTS ─────────────────────────────────────────────────────────────── */

const _loadReports = () => {
  if (_reportsCache !== null) return _reportsCache;
  try {
    const raw = fs.readFileSync(REPORTS_FILE, "utf8");
    _reportsCache = JSON.parse(raw);
  } catch {
    _reportsCache = [];
  }
  return _reportsCache;
};

const _persistReports = () => {
  const tmp = `${REPORTS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(_reportsCache, null, 2), "utf8");
  fs.renameSync(tmp, REPORTS_FILE);
};

const createReport = (doc) => {
  _loadReports();
  const report = {
    id:              _generateId("RPT"),
    createdAt:       new Date().toISOString(),
    updatedAt:       new Date().toISOString(),
    status:          "pending",
    assignedTo:      null,
    notes:           [],
    escalationLevel: 0,
    ...doc,
  };
  _reportsCache.unshift(report);
  _persistReports();
  logger.info(`reportStore → report created (id: ${report.id})`);
  return report;
};

const findReports = (filterFn = () => true, { limit = 100, skip = 0 } = {}) => {
  const data = _loadReports();
  return data.filter(filterFn).slice(skip, skip + limit);
};

const findReportById = (id) => {
  const data = _loadReports();
  return data.find((r) => r.id === id) || null;
};

const updateReport = (id, updates) => {
  _loadReports();
  const idx = _reportsCache.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  _reportsCache[idx] = {
    ..._reportsCache[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  _persistReports();
  return _reportsCache[idx];
};

const getAllReports = (limit = 500) => {
  const data = _loadReports();
  return data.slice(0, limit);
};

/* ─── CASES ───────────────────────────────────────────────────────────────── */

const _loadCases = () => {
  if (_casesCache !== null) return _casesCache;
  try {
    const raw = fs.readFileSync(CASES_FILE, "utf8");
    _casesCache = JSON.parse(raw);
  } catch {
    _casesCache = [];
  }
  return _casesCache;
};

const _persistCases = () => {
  const tmp = `${CASES_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(_casesCache, null, 2), "utf8");
  fs.renameSync(tmp, CASES_FILE);
};

const createCase = (doc) => {
  _loadCases();
  const caseDoc = {
    id:        _generateId("CASE"),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status:    "open",
    ...doc,
  };
  _casesCache.unshift(caseDoc);
  _persistCases();
  return caseDoc;
};

const findCases = (filterFn = () => true, { limit = 100, skip = 0 } = {}) => {
  const data = _loadCases();
  return data.filter(filterFn).slice(skip, skip + limit);
};

const updateCase = (id, updates) => {
  _loadCases();
  const idx = _casesCache.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  _casesCache[idx] = { ..._casesCache[idx], ...updates, updatedAt: new Date().toISOString() };
  _persistCases();
  return _casesCache[idx];
};

module.exports = {
  createReport, findReports, findReportById, updateReport, getAllReports,
  createCase, findCases, updateCase,
};
