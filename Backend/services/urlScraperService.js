const axios  = require("axios");
const logger = require("../utils/logger");

const FETCH_TIMEOUT = 8000;
const MAX_TEXT_LEN  = 3000;

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/i;

const isUrl = (text) => URL_REGEX.test(text.trim());

const extractUrl = (text) => {
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
};

const stripHtml = (str = "") =>
  str
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();

const extractMeta = (html, tag, attr = "content") => {
  const re = new RegExp(`<meta[^>]*(?:name|property)=["']${tag}["'][^>]*${attr}=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]*${attr}=["']([^"']+)["'][^>]*(?:name|property)=["']${tag}["']`, "i");
  const m = html.match(re) || html.match(re2);
  return m ? m[1] : null;
};

const extractTitle = (html) => {
  const og = extractMeta(html, "og:title");
  if (og) return og;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : null;
};

const extractBodyText = (html) => {
  let body = html;
  const articleMatch = body.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) body = articleMatch[1];
  else {
    const mainMatch = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) body = mainMatch[1];
  }
  const paragraphs = [];
  const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pRe.exec(body)) !== null) {
    const text = stripHtml(m[1]);
    if (text.length > 30) paragraphs.push(text);
  }
  if (paragraphs.length > 0) return paragraphs.join(" ").slice(0, MAX_TEXT_LEN);
  return stripHtml(body).slice(0, MAX_TEXT_LEN);
};

const scrapeUrl = async (url) => {
  try {
    logger.info(`urlScraperService → fetching: ${url}`);

    const response = await axios.get(url, {
      timeout: FETCH_TIMEOUT,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; SentinelAI/1.0; +https://sentinel-ai.gov)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      maxRedirects: 5,
      responseType: "text",
    });

    const html        = response.data || "";
    const title       = extractTitle(html) || "Article";
    const description = extractMeta(html, "og:description") ||
                        extractMeta(html, "description") || "";
    const bodyText    = extractBodyText(html);
    const fullText    = `${title}. ${description} ${bodyText}`.slice(0, MAX_TEXT_LEN);

    logger.info(`urlScraperService → scraped "${title}" (${fullText.length} chars)`);

    return { success: true, title, description, text: fullText, url };
  } catch (err) {
    logger.warn(`urlScraperService → failed to scrape ${url}: ${err.message}`);
    return { success: false, title: url, description: "", text: url, url };
  }
};

module.exports = { isUrl, extractUrl, scrapeUrl };
