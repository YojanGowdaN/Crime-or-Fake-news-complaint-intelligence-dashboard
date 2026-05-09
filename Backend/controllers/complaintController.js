const crypto              = require("crypto");
const reportStore         = require("../utils/reportStore");
const crimeDetectionService = require("../services/crimeDetectionService");
const logger              = require("../utils/logger");
const { emitAlert }       = require("../socket");

const KNOWN_LOCATIONS = [
  "Bengaluru","Bangalore","Mumbai","Delhi","New Delhi","Chennai",
  "Hyderabad","Kolkata","Pune","Ahmedabad","Jaipur","Lucknow",
  "Surat","Kanpur","Nagpur","Indore","Thane","Bhopal","Patna",
  "Ludhiana","Agra","Nashik","Vadodara","Meerut","Varanasi",
];

const extractLocation = (text = "", hint = "") => {
  const combined = `${hint} ${text}`;
  for (const city of KNOWN_LOCATIONS) {
    if (new RegExp(`\\b${city}\\b`, "i").test(combined)) return city;
  }
  return hint.trim() || "Unknown";
};

const submitComplaint = async (req, res, next) => {
  try {
    const text     = (req.body.text     || "").trim();
    const location = (req.body.location || "").trim();

    if (!text) {
      return res.status(400).json({ error: "Complaint text is required" });
    }

    const { crime_type, severity } = crimeDetectionService.detectCrime(text, false);

    const resolvedLocation = extractLocation(text, location);

    const trackingId = "SEN-" + crypto.randomBytes(4).toString("hex").toUpperCase();

    const report = reportStore.createReport({
      title:           `Public Complaint — ${crime_type !== "Unknown" ? crime_type : "Unclassified"} — ${resolvedLocation}`,
      content:         text.slice(0, 2000),
      location:        resolvedLocation,
      crimeType:       crime_type,
      riskLevel:       severity,
      fakeProbability: null,
      confidenceScore: null,
      reasoning:       "Submitted via public complaint form. Pending authority review.",
      channel:         "public-complaint",
      trackingId,
      status:          "pending",
    });

    logger.info(`complaintController → complaint saved as ${report.id} (tracking: ${trackingId})`);

    try {
      emitAlert({
        message:  `New public complaint received — ${crime_type}`,
        location: resolvedLocation,
        severity: severity.toLowerCase(),
      });

      const { getAuthorityIo } = require("../socket");
      const aio = getAuthorityIo();
      if (aio) {
        aio.emit("new-complaint", {
          id:        report.id,
          title:     report.title,
          location:  resolvedLocation,
          crimeType: crime_type,
          riskLevel: severity,
          channel:   "public-complaint",
          timestamp: report.createdAt,
        });
      }
    } catch (_) {}

    res.status(201).json({
      success:    true,
      trackingId,
      reportId:   report.id,
      message:    "Your complaint has been received and is pending authority review.",
      crimeType:  crime_type,
      location:   resolvedLocation,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { submitComplaint };
