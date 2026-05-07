const Alert           = require("../models/Alert");
const whatsappService = require("./whatsappService");
const { emitAlert }   = require("../socket");
const logger          = require("../utils/logger");

const PANIC_THRESHOLD         = 70;
const DEFAULT_VIRALITY_FACTOR = 85;

const KNOWN_LOCATIONS = [
  "Bengaluru", "Bangalore", "Mumbai", "Delhi", "New Delhi", "Chennai",
  "Hyderabad", "Kolkata", "Pune", "Ahmedabad", "Jaipur", "Lucknow",
  "Surat", "Kanpur", "Nagpur", "Indore", "Thane", "Bhopal", "Patna",
  "Ludhiana", "Agra", "Nashik", "Vadodara", "Meerut", "Varanasi",
  "London", "New York", "Paris", "Berlin", "Tokyo", "Beijing",
  "Islamabad", "Kabul", "Kyiv", "Moscow",
];

const extractLocation = (text) => {
  for (const city of KNOWN_LOCATIONS) {
    if (new RegExp(`\\b${city}\\b`, "i").test(text)) return city;
  }
  return "Unknown";
};

const computePanicIndex = async ({
  text,
  fake_probability,
  panic_score,
  crime_type,
  severity,
  virality_factor = DEFAULT_VIRALITY_FACTOR,
  title        = null,
  sourceUrl    = null,
  reasoning    = null,
  confidence   = 0.75,
}) => {
  const panic_index = Math.round(
    fake_probability * 0.4 +
    panic_score      * 0.4 +
    virality_factor  * 0.2
  );

  const location  = extractLocation(text);
  const timestamp = new Date().toISOString();

  logger.info(
    `panicService → panic_index=${panic_index} | location=${location} | threshold=${PANIC_THRESHOLD}`
  );

  let alertSaved  = false;
  let reportSaved = false;

  if (panic_index > PANIC_THRESHOLD) {
    logger.warn(
      `panicService → Panic Index ${panic_index} exceeds threshold — triggering alerts`
    );

    const alertData = {
      text, fake_probability, crime_type, severity,
      panic_score, panic_index, location, timestamp,
    };

    try {
      Alert.create(alertData);
      alertSaved = true;
      logger.info("panicService → alert saved to local file store");
    } catch (fileErr) {
      logger.error(`panicService → failed to save alert: ${fileErr.message}`);
    }

    try {
      const reportStore = require("../utils/reportStore");
      reportStore.createReport({
        title:           title || `${crime_type} Detected — ${location}`,
        sourceLink:      sourceUrl || null,
        content:         text.slice(0, 1000),
        fakeProbability: fake_probability,
        confidenceScore: confidence,
        riskLevel:       severity,
        crimeType:       crime_type,
        reasoning:       reasoning || `Panic Index ${panic_index} exceeded threshold.`,
        location,
        timestamp,
        channel:         sourceUrl ? "url" : "text",
        status:          "pending",
      });
      reportSaved = true;
      logger.info("panicService → authority report created");
    } catch (repErr) {
      logger.error(`panicService → failed to create authority report: ${repErr.message}`);
    }

    await whatsappService.sendAlert(alertData);

    emitAlert({
      message:    `Possible ${crime_type} Rumor Detected`,
      location,
      severity,
      panic_index,
    });

    try {
      const { getAuthorityIo } = require("../socket");
      const aio = getAuthorityIo();
      if (aio) {
        aio.emit("authority-alert", {
          title:           title || `${crime_type} Detected — ${location}`,
          riskLevel:       severity,
          fakeProbability: fake_probability,
          location,
          timestamp,
          crime_type,
        });
      }
    } catch (_) {}
  } else {
    logger.info(
      `panicService → Panic Index ${panic_index} below threshold — no alert triggered`
    );
  }

  return { panic_index, location, timestamp, alertSaved, reportSaved };
};

module.exports = { computePanicIndex };
