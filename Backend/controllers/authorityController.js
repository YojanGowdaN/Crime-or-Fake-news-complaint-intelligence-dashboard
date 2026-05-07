const { generateToken, verifyAuthority } = require("../middleware/authMiddleware");
const reportStore = require("../utils/reportStore");
const logger      = require("../utils/logger");

/* ── LOGIN ─────────────────────────────────────────────────────────────────── */
const login = (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  const user = verifyAuthority(username, password);
  if (!user) {
    logger.warn(`authorityController → failed login attempt for "${username}"`);
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = generateToken(user);
  logger.info(`authorityController → ${username} logged in (role: ${user.role})`);
  res.status(200).json({
    success: true,
    token,
    user: {
      id: user.id, name: user.name, username: user.username,
      role: user.role, badge: user.badge, unit: user.unit,
    },
  });
};

/* ── REPORTS ───────────────────────────────────────────────────────────────── */
const getReports = (req, res) => {
  const { status, riskLevel, limit = 100, skip = 0 } = req.query;
  const filterFn = (r) => {
    if (status && r.status !== status) return false;
    if (riskLevel && r.riskLevel !== riskLevel) return false;
    return true;
  };
  const reports = reportStore.findReports(filterFn, {
    limit: Math.min(parseInt(limit, 10) || 100, 500),
    skip:  parseInt(skip, 10) || 0,
  });
  logger.info(`authorityController → getReports returned ${reports.length} records`);
  res.status(200).json({ success: true, count: reports.length, reports });
};

const getReportById = (req, res) => {
  const report = reportStore.findReportById(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  res.status(200).json({ success: true, report });
};

const updateReportStatus = (req, res) => {
  const { status, note, assignedTo } = req.body;
  const VALID = ["pending", "investigating", "resolved", "dismissed", "escalated"];
  if (!status || !VALID.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID.join(", ")}` });
  }
  const report = reportStore.findReportById(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });

  const updates = { status };
  if (assignedTo) updates.assignedTo = assignedTo;
  if (note) {
    updates.notes = [
      ...(report.notes || []),
      { text: note, by: req.authority.name, at: new Date().toISOString() },
    ];
  }

  const updated = reportStore.updateReport(req.params.id, updates);
  logger.info(`authorityController → report ${req.params.id} → ${status} by ${req.authority.name}`);
  res.status(200).json({ success: true, report: updated });
};

const escalateReport = (req, res) => {
  const { reason } = req.body;
  const report = reportStore.findReportById(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });

  const newLevel = (report.escalationLevel || 0) + 1;
  const note     = { text: reason || "Escalated for further review", by: req.authority.name, at: new Date().toISOString(), type: "escalation" };
  const updated  = reportStore.updateReport(req.params.id, {
    status:          "escalated",
    escalationLevel: newLevel,
    notes:           [...(report.notes || []), note],
  });
  logger.info(`authorityController → report ${req.params.id} escalated to level ${newLevel}`);
  res.status(200).json({ success: true, report: updated, escalationLevel: newLevel });
};

const addNote = (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Note text required" });
  const report = reportStore.findReportById(req.params.id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  const note    = { text, by: req.authority.name, at: new Date().toISOString(), type: "note" };
  const updated = reportStore.updateReport(req.params.id, {
    notes: [...(report.notes || []), note],
  });
  res.status(200).json({ success: true, report: updated });
};

/* ── ANALYTICS ─────────────────────────────────────────────────────────────── */
const getAnalytics = (req, res) => {
  const all = reportStore.getAllReports(1000);

  const byStatus = all.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1; return acc;
  }, {});

  const byRisk = all.reduce((acc, r) => {
    const lvl = r.riskLevel || "LOW";
    acc[lvl] = (acc[lvl] || 0) + 1; return acc;
  }, {});

  const byCrime = all.reduce((acc, r) => {
    const ct = r.crimeType || "Unknown";
    acc[ct] = (acc[ct] || 0) + 1; return acc;
  }, {});

  const byLocation = all.reduce((acc, r) => {
    const loc = r.location || "Unknown";
    acc[loc] = (acc[loc] || 0) + 1; return acc;
  }, {});

  const now      = Date.now();
  const last24h  = all.filter((r) => now - new Date(r.createdAt).getTime() < 86400000).length;
  const last7d   = all.filter((r) => now - new Date(r.createdAt).getTime() < 604800000).length;

  const avgConfidence = all.length
    ? Math.round((all.reduce((s, r) => s + (r.confidenceScore || 0.5), 0) / all.length) * 100)
    : 0;

  const highRisk = all.filter((r) => r.riskLevel === "HIGH" || r.riskLevel === "CRITICAL").length;

  const trendData = buildTrendData(all);

  res.status(200).json({
    success: true,
    summary: {
      total: all.length,
      last24h,
      last7d,
      highRisk,
      avgConfidence,
    },
    byStatus,
    byRisk,
    byCrime,
    byLocation,
    trendData,
  });
};

const buildTrendData = (reports) => {
  const buckets = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = 0;
  }
  reports.forEach((r) => {
    const day = (r.createdAt || r.timestamp || "").slice(0, 10);
    if (day in buckets) buckets[day]++;
  });
  return Object.entries(buckets).map(([date, count]) => ({ date, count }));
};

/* ── CASES ─────────────────────────────────────────────────────────────────── */
const getCases = (req, res) => {
  const { status } = req.query;
  const filterFn = (c) => !status || c.status === status;
  const cases = reportStore.findCases(filterFn);
  res.status(200).json({ success: true, count: cases.length, cases });
};

const createCase = (req, res) => {
  const { reportId, title, priority, description } = req.body;
  if (!title) return res.status(400).json({ error: "Case title required" });
  const newCase = reportStore.createCase({
    reportId,
    title,
    priority: priority || "medium",
    description,
    createdBy: req.authority.name,
    assignedTo: req.authority.name,
  });
  res.status(201).json({ success: true, case: newCase });
};

/* ── LIVE ALERTS ───────────────────────────────────────────────────────────── */
const getRecentAlerts = (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const recent = reportStore
    .getAllReports(200)
    .filter((r) => r.riskLevel === "HIGH" || r.riskLevel === "CRITICAL")
    .slice(0, limit);
  res.status(200).json({ success: true, alerts: recent });
};

module.exports = {
  login, getReports, getReportById, updateReportStatus, escalateReport,
  addNote, getAnalytics, getCases, createCase, getRecentAlerts,
};
