/**
 * @file controllers/heatmapController.js
 * @description Aggregates local alert data into geo-coordinates for heatmap
 *              rendering (Leaflet.js, Google Maps, Mapbox, etc.).
 *
 *              Data source: local JSON file (data/alerts.json)
 *              No database connection required.
 *
 *              Steps
 *              ─────
 *              1. Load the last 500 HIGH/CRITICAL alerts from the local store.
 *              2. Group by location — keep the highest severity seen per city.
 *              3. Map each city name to lat/lng from the built-in lookup table.
 *              4. Return a flat array of { lat, lng, risk, location }.
 *
 * @dependencies ../models/Alert, ../utils/logger
 */

const Alert  = require("../models/Alert");
const logger = require("../utils/logger");

/* ─── City → coordinates lookup ─────────────────────────────────────────── */
const CITY_COORDINATES = {
  "Bengaluru":  { lat: 12.9716,  lng: 77.5946  },
  "Bangalore":  { lat: 12.9716,  lng: 77.5946  },
  "Mumbai":     { lat: 19.0760,  lng: 72.8777  },
  "Delhi":      { lat: 28.6139,  lng: 77.2090  },
  "New Delhi":  { lat: 28.6139,  lng: 77.2090  },
  "Chennai":    { lat: 13.0827,  lng: 80.2707  },
  "Hyderabad":  { lat: 17.3850,  lng: 78.4867  },
  "Kolkata":    { lat: 22.5726,  lng: 88.3639  },
  "Pune":       { lat: 18.5204,  lng: 73.8567  },
  "Ahmedabad":  { lat: 23.0225,  lng: 72.5714  },
  "Jaipur":     { lat: 26.9124,  lng: 75.7873  },
  "Lucknow":    { lat: 26.8467,  lng: 80.9462  },
  "Varanasi":   { lat: 25.3176,  lng: 82.9739  },
  "Nagpur":     { lat: 21.1458,  lng: 79.0882  },
  "Indore":     { lat: 22.7196,  lng: 75.8577  },
  "Bhopal":     { lat: 23.2599,  lng: 77.4126  },
  "Patna":      { lat: 25.5941,  lng: 85.1376  },
  "London":     { lat: 51.5074,  lng: -0.1278  },
  "New York":   { lat: 40.7128,  lng: -74.0060 },
  "Paris":      { lat: 48.8566,  lng: 2.3522   },
  "Berlin":     { lat: 52.5200,  lng: 13.4050  },
  "Tokyo":      { lat: 35.6762,  lng: 139.6503 },
  "Kyiv":       { lat: 50.4501,  lng: 30.5234  },
  "Moscow":     { lat: 55.7558,  lng: 37.6173  },
  "Unknown":    { lat: 20.5937,  lng: 78.9629  }, // centre of India as fallback
};

const SEVERITY_RANK = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };

/**
 * GET /api/heatmap
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const getHeatmap = (req, res, next) => {
  try {
    logger.info("heatmapController → building heatmap data from local store…");

    // Fetch all HIGH/CRITICAL alerts from the local JSON store
    const alerts = Alert.findAll(500).filter(
      (a) => a.severity === "HIGH" || a.severity === "CRITICAL"
    );

    // Group by location; retain the highest severity per city
    const locationMap = {};
    for (const alert of alerts) {
      const loc = alert.location || "Unknown";
      if (
        !locationMap[loc] ||
        SEVERITY_RANK[alert.severity] > SEVERITY_RANK[locationMap[loc]]
      ) {
        locationMap[loc] = alert.severity;
      }
    }

    // Map to lat/lng
    const heatmap = Object.entries(locationMap).map(([location, risk]) => {
      const coords = CITY_COORDINATES[location] || CITY_COORDINATES["Unknown"];
      return { lat: coords.lat, lng: coords.lng, risk, location };
    });

    logger.info(`heatmapController → returning ${heatmap.length} heatmap point(s)`);
    res.status(200).json(heatmap);
  } catch (error) {
    next(error);
  }
};

module.exports = { getHeatmap };
