const express  = require("express");
const multer   = require("multer");
const router   = express.Router();
const { submitComplaint } = require("../controllers/complaintController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.post("/", upload.single("screenshot"), submitComplaint);

module.exports = router;
