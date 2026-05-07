const express = require("express");
const router  = express.Router();
const {
  login, getReports, getReportById, updateReportStatus, escalateReport,
  addNote, getAnalytics, getCases, createCase, getRecentAlerts,
} = require("../controllers/authorityController");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

router.post("/login", login);

router.use(requireAuth);

router.get ("/reports",              getReports);
router.get ("/reports/recent-alerts", getRecentAlerts);
router.get ("/reports/:id",          getReportById);
router.patch("/reports/:id/status",  updateReportStatus);
router.post ("/reports/:id/escalate", escalateReport);
router.post ("/reports/:id/notes",   addNote);

router.get ("/analytics", getAnalytics);

router.get ("/cases",  getCases);
router.post("/cases",  requireRole("SUPER_ADMIN", "INVESTIGATOR"), createCase);

module.exports = router;
