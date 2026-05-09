/**
 * utils/urlDetector.js
 * Detects URLs inside a message string and classifies the message type.
 *
 * Message types:
 *   "url"   — contains one or more http/https links
 *   "text"  — plain text or news text
 *   "image" — placeholder for image/caption messages (handled in bot layer)
 */

// Regex that matches most common URL formats including short links
const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

/**
 * Extract all URLs found in a text string.
 * @param {string} text
 * @returns {string[]} array of matched URLs
 */
const extractUrls = (text = "") => {
  const matches = text.match(URL_REGEX);
  return matches || [];
};

/**
 * Determine the message type.
 * @param {string} text
 * @param {boolean} hasImage  — true when a WhatsApp image message is received
 * @returns {"url"|"text"|"image"}
 */
const getMessageType = (text = "", hasImage = false) => {
  if (hasImage) return "image";
  if (extractUrls(text).length > 0) return "url";
  return "text";
};

module.exports = { extractUrls, getMessageType };
