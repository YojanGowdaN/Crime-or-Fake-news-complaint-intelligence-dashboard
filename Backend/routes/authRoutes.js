const express    = require("express");
const router     = express.Router();
const jwt        = require("jsonwebtoken");
const logger     = require("../utils/logger");

const JWT_SECRET = process.env.JWT_SECRET || "sentinel_cyber_intelligence_secret_2024";

const DEMO_USERS = [
  { id: "usr001", username: "user_demo",    password: "Demo@2024",  name: "Demo User",  role: "PUBLIC"  },
  { id: "usr002", username: "analyst_ravi", password: "Ravi@2024",  name: "Ravi Kumar", role: "ANALYST" },
];

router.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const user = DEMO_USERS.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    logger.warn(`authRoutes → failed login attempt for "${username}"`);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

  logger.info(`authRoutes → ${username} logged in (role: ${user.role})`);
  res.status(200).json({
    success: true,
    token,
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  });
});

module.exports = router;
