const express = require("express");
const router  = express.Router();
const { getHeatmap } = require("../controllers/heatmapController");

router.get("/", getHeatmap);

module.exports = router;
