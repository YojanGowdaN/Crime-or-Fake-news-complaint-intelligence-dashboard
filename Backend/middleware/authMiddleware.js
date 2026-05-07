const jwt    = require("jsonwebtoken");
const logger = require("../utils/logger");

const JWT_SECRET = process.env.JWT_SECRET || "sentinel_cyber_intelligence_secret_2024";

const DEMO_AUTHORITIES = [
  {
    id:       "auth001",
    username: "sentinel_admin",
    password: "Sentinel@2024",
    name:     "Admin Officer",
    role:     "SUPER_ADMIN",
    badge:    "SA-001",
    unit:     "Cyber Intelligence Cell",
  },
  {
    id:       "auth002",
    username: "officer_raj",
    password: "Officer@2024",
    name:     "Raj Kumar",
    role:     "INVESTIGATOR",
    badge:    "INV-042",
    unit:     "Fake News Division",
  },
  {
    id:       "auth003",
    username: "analyst_priya",
    password: "Analyst@2024",
    name:     "Priya Sharma",
    role:     "ANALYST",
    badge:    "ANL-017",
    unit:     "Digital Forensics",
  },
];

const generateToken = (user) =>
  jwt.sign(
    { id: user.id, username: user.username, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: "24h" }
  );

const verifyAuthority = (username, password) => {
  const user = DEMO_AUTHORITIES.find(
    (u) => u.username === username && u.password === password
  );
  return user || null;
};

const requireAuth = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token      = authHeader && authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Access denied — no token provided", status: 401 });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.authority = decoded;
    next();
  } catch (err) {
    logger.warn(`authMiddleware → invalid token: ${err.message}`);
    return res.status(401).json({ error: "Invalid or expired token", status: 401 });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.authority) return res.status(401).json({ error: "Not authenticated", status: 401 });
  if (!roles.includes(req.authority.role)) {
    return res.status(403).json({ error: "Insufficient permissions", status: 403 });
  }
  next();
};

module.exports = { generateToken, verifyAuthority, requireAuth, requireRole, DEMO_AUTHORITIES };
