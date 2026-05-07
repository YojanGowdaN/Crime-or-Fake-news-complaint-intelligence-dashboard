const express = require("express");
const router  = express.Router();
const {
  handleIncoming,
  verifyWebhook,
  analyzeForBot,
} = require("../controllers/whatsappController");

router.get("/webhook",  verifyWebhook);
router.post("/webhook", handleIncoming);
router.post("/analyze", analyzeForBot);

module.exports = router;
