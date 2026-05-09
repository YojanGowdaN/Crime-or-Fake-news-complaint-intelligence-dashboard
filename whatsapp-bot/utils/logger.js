/**
 * utils/logger.js
 * Simple console logger with timestamps and colour-coded levels.
 * Keeps things readable in a terminal during a hackathon demo.
 */

const COLOURS = {
  INFO:  "\x1b[36m",  // cyan
  WARN:  "\x1b[33m",  // yellow
  ERROR: "\x1b[31m",  // red
  DEBUG: "\x1b[35m",  // magenta
  RESET: "\x1b[0m",
};

const timestamp = () => new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm

const log = (level, ...args) => {
  const col = COLOURS[level] || COLOURS.RESET;
  console.log(`${col}[${timestamp()}] [${level}]${COLOURS.RESET}`, ...args);
};

module.exports = {
  info:  (...a) => log("INFO",  ...a),
  warn:  (...a) => log("WARN",  ...a),
  error: (...a) => log("ERROR", ...a),
  debug: (...a) => log("DEBUG", ...a),
};
