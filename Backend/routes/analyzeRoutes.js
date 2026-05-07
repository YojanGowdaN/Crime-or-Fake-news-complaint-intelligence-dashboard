const express  = require("express");
const router   = express.Router();
const { analyzeText } = require("../controllers/analyzeController");

router.post("/", analyzeText);

module.exports = router;
