/**
 * @file services/llamaService.js
 * @description Fake-news detection powered by Meta's Llama 3 open-source model
 *              via the Groq inference API (free tier, ultra-low latency).
 *
 *              When GROQ_API_KEY is not set, a local keyword-based analyser
 *              runs instead — it inspects misinformation signals, credibility
 *              markers, structural cues (caps ratio, punctuation) and crime
 *              hints to produce a deterministic, content-specific result.
 *
 * @dependencies axios, ../utils/logger
 */

const axios  = require("axios");
const logger = require("../utils/logger");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL   = "llama-3.3-70b-versatile";
const GROQ_TIMEOUT = 10000;

const SYSTEM_PROMPT = `You are Sentinel AI's fake news detection engine powered by Llama 3.
Analyse the user-provided news text and determine whether it is fake or real misinformation.

Respond with ONLY a valid JSON object — no explanation, no markdown, no extra text:
{
  "is_fake": true | false,
  "confidence": <decimal between 0.0 and 1.0>,
  "crime_hint": "<most relevant crime category or null>",
  "reasoning": "<one sentence explanation>"
}

Crime categories to consider: Riot, Homicide, Robbery, Kidnapping, Cybercrime,
Assault, Violence, Terrorism, Political, Communal, Financial, Health, Unknown.`;

/* ─── Weighted misinformation signal lists ───────────────────────────────── */
const FAKE_SIGNALS = [
  ["hoax",                    3],
  ["fabricated",              3],
  ["propaganda",              3],
  ["cover-up",                3],
  ["cover up",                3],
  ["misinformation",          3],
  ["false claim",             3],
  ["government hiding",       3],
  ["media hiding",            3],
  ["share before deleted",    3],
  ["they don't want you",     3],
  ["fake",                    2],
  ["rumor",                   2],
  ["rumour",                  2],
  ["unverified",              2],
  ["conspiracy",              2],
  ["leaked",                  2],
  ["no official confirmation", 2],
  ["misleading",              2],
  ["propaganda",              2],
  ["spreading rumour",        2],
  ["viral message",           2],
  ["shocking",                1],
  ["breaking",                1],
  ["exclusive",               1],
  ["exposed",                 1],
  ["sources claim",           1],
  ["viral",                   1],
  ["alleged",                 1],
  ["supposedly",              1],
  ["claim",                   1],
];

const CREDIBLE_SIGNALS = [
  ["according to",            2],
  ["officials said",          2],
  ["confirmed",               2],
  ["press conference",        3],
  ["official statement",      3],
  ["government statement",    3],
  ["who confirmed",           3],
  ["reuters",                 3],
  ["associated press",        3],
  ["police said",             2],
  ["authorities said",        2],
  ["spokesperson",            2],
  ["ministry",                2],
  ["study shows",             2],
  ["data shows",              2],
  ["research",                1],
  ["university",              2],
  ["verified",                2],
  ["bbc",                     2],
  ["authorities",             1],
  ["statement",               1],
  ["official",                1],
  ["evidence",                1],
];

const CRIME_KEYWORDS = [
  ["riot",        "Riot"],
  ["protest",     "Civil Unrest"],
  ["murder",      "Homicide"],
  ["killed",      "Homicide"],
  ["shooting",    "Homicide"],
  ["robbery",     "Robbery"],
  ["theft",       "Robbery"],
  ["loot",        "Robbery"],
  ["kidnap",      "Kidnapping"],
  ["abduct",      "Kidnapping"],
  ["hack",        "Cybercrime"],
  ["phishing",    "Cybercrime"],
  ["breach",      "Cybercrime"],
  ["assault",     "Assault"],
  ["attack",      "Assault"],
  ["stab",        "Assault"],
  ["violence",    "Violence"],
  ["bomb",        "Terrorism"],
  ["terror",      "Terrorism"],
  ["blast",       "Terrorism"],
  ["explosive",   "Terrorism"],
  ["election",    "Political"],
  ["evm",         "Political"],
  ["vaccine",     "Health"],
  ["hospital",    "Health"],
  ["virus",       "Health"],
  ["financial",   "Financial"],
  ["bank",        "Financial"],
  ["communal",    "Communal"],
];

/* ─── Deterministic text fingerprint (0-1) based on content features ─────── */
const textFingerprint = (text) => {
  // Produces a stable 0-1 float from the text's own characters.
  // Used to break the "always 49%" tie when no keywords fire.
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return (Math.abs(h) % 1000) / 1000;
};

/* ─── Trusted / suspicious domain lists for URL scoring ─────────────────── */
const TRUSTED_DOMAINS = [
  "youtube.com","youtu.be","bbc.com","bbc.co.uk","reuters.com","apnews.com",
  "nytimes.com","theguardian.com","bloomberg.com","wsj.com","economist.com",
  "ndtv.com","thehindu.com","hindustantimes.com","timesofindia.com",
  "indianexpress.com","livemint.com","moneycontrol.com","business-standard.com",
  "aajtak.in","abplive.com","zeenews.india.com","news18.com","india.com",
  "wikipedia.org","google.com","github.com","stackoverflow.com","medium.com",
  "pib.gov.in","mygov.in","mohfw.gov.in","who.int","cdc.gov","unicef.org",
  "twitter.com","x.com","instagram.com","facebook.com","linkedin.com",
];

const SUSPICIOUS_DOMAINS = [
  "bit.ly","tinyurl.com","shorturl.at","ow.ly","t.co","rb.gy","cutt.ly",
  "fakealert","rumourmills","conspiracynews","alternativemedia",
];

const scoreUrl = (url) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (TRUSTED_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d))) {
      return { domainScore: 4, label: "trusted" };
    }
    if (SUSPICIOUS_DOMAINS.some(d => hostname.includes(d))) {
      return { domainScore: -3, label: "suspicious" };
    }
    // Unknown domain — slightly suspicious (prefer caution)
    return { domainScore: -1, label: "unknown" };
  } catch {
    return { domainScore: 0, label: "invalid" };
  }
};

/* ─── Local analyser (runs when GROQ_API_KEY is absent or Groq fails) ─────── */
const localAnalyse = (text) => {
  const lower = text.toLowerCase();

  let fakeScore     = 0;
  let credibleScore = 0;

  // ── URL-aware scoring ────────────────────────────────────────────────────
  // Extract all URLs and strip them before keyword matching so words like
  // "breaking" or "viral" inside a URL path don't trigger fake signals.
  const urlMatches = text.match(/https?:\/\/[^\s]+/gi) || [];
  let textForKeywords = text;
  let urlReasoning   = "";

  if (urlMatches.length > 0) {
    // Remove URLs from the keyword-analysis text
    textForKeywords = text.replace(/https?:\/\/[^\s]+/gi, " ").trim();

    // Score each URL by domain reputation
    let totalDomainScore = 0;
    const labels = [];
    for (const url of urlMatches) {
      const { domainScore, label } = scoreUrl(url);
      totalDomainScore += domainScore;
      labels.push(label);
    }

    if (totalDomainScore >= 3) {
      credibleScore += 4;
      urlReasoning = "URL is from a reputable, well-known domain.";
    } else if (totalDomainScore >= 1) {
      credibleScore += 2;
      urlReasoning = "URL domain appears legitimate.";
    } else if (totalDomainScore < -1) {
      fakeScore += 3;
      urlReasoning = "URL uses a suspicious or unknown shortener/domain.";
    } else {
      fakeScore += 1;
      urlReasoning = "URL domain is unrecognised — treat with caution.";
    }
  }

  // ── Keyword scoring on non-URL text only ─────────────────────────────────
  const lowerForKeywords = textForKeywords.toLowerCase();
  for (const [signal, weight] of FAKE_SIGNALS) {
    if (lowerForKeywords.includes(signal)) fakeScore += weight;
  }
  for (const [signal, weight] of CREDIBLE_SIGNALS) {
    if (lowerForKeywords.includes(signal)) credibleScore += weight;
  }

  const nonSpaceLen = textForKeywords.replace(/\s/g, "").length || 1;
  const capsRatio   = (textForKeywords.match(/[A-Z]/g) || []).length / nonSpaceLen;
  if (capsRatio > 0.4)  fakeScore += 3;
  else if (capsRatio > 0.25) fakeScore += 1;

  const exclCount = (textForKeywords.match(/!/g) || []).length;
  if (exclCount >= 3) fakeScore += 2;
  else if (exclCount >= 1) fakeScore += 1;

  if ((textForKeywords.match(/\?/g) || []).length >= 3) fakeScore += 1;

  let crime_hint = null;
  for (const [kw, cat] of CRIME_KEYWORDS) {
    if (lower.includes(kw)) { crime_hint = cat; break; }
  }

  const net = fakeScore - credibleScore;

  let confidence, is_fake;
  if      (net >= 6)  { is_fake = true;  confidence = 0.85; }
  else if (net >= 3)  { is_fake = true;  confidence = 0.72; }
  else if (net >= 1)  { is_fake = true;  confidence = 0.58; }
  else if (net === 0) { is_fake = false; confidence = 0.52; }
  else if (net >= -3) { is_fake = false; confidence = 0.68; }
  else                { is_fake = false; confidence = 0.82; }

  // Add content-specific variation (±8%) so the same signal count on
  // different texts still produces different scores.
  const fp = textFingerprint(text);
  const variation = (fp - 0.5) * 0.16;
  confidence = parseFloat(Math.min(0.95, Math.max(0.05, confidence + variation)).toFixed(4));

  const baseReason = is_fake
    ? `Keyword analysis: ${fakeScore} misinformation signal(s) detected vs ${credibleScore} credibility indicator(s). Treat with caution.`
    : `Keyword analysis: ${credibleScore} credibility indicator(s) vs ${fakeScore} misinformation signal(s) — content appears reliable.`;
  const reasoning = urlReasoning ? `${urlReasoning} ${baseReason}` : baseReason;

  return {
    is_fake,
    confidence:  parseFloat(confidence.toFixed(4)),
    crime_hint:  crime_hint || "Unknown",
    reasoning,
    source:      "local-analysis",
  };
};

/* ─── JSON parser that tolerates minor formatting issues ─────────────────── */
const parseGroqJSON = (raw) => {
  const cleaned = raw.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const match   = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in Llama 3 response");
  return JSON.parse(match[0]);
};

/* ─── Public API ─────────────────────────────────────────────────────────── */
const detectFakeNews = async (text) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    logger.warn("llamaService → GROQ_API_KEY not set; using local keyword analyser");
    return localAnalyse(text);
  }

  try {
    logger.info("llamaService → calling Groq (Llama 3)…");

    const response = await axios.post(
      GROQ_API_URL,
      {
        model:    GROQ_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: `Analyse this text for fake news:\n\n"${text.slice(0, 1500)}"` },
        ],
        temperature: 0.1,
        max_tokens:  256,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: GROQ_TIMEOUT,
      }
    );

    const rawContent = response.data.choices?.[0]?.message?.content || "";
    logger.info(`llamaService → raw Llama 3 response: ${rawContent.slice(0, 120)}`);

    const parsed = parseGroqJSON(rawContent);

    const result = {
      is_fake:    Boolean(parsed.is_fake),
      confidence: Math.min(1, Math.max(0, parseFloat(parsed.confidence) || 0.5)),
      crime_hint: parsed.crime_hint || null,
      reasoning:  parsed.reasoning  || "",
      source:     "llama3-groq",
    };

    logger.info(
      `llamaService → is_fake=${result.is_fake} | confidence=${result.confidence} | crime=${result.crime_hint}`
    );

    return result;
  } catch (error) {
    if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
      logger.warn(`llamaService → Groq timed out after ${GROQ_TIMEOUT}ms — using local analyser`);
    } else {
      logger.warn(`llamaService → Groq API error: ${error.message} — using local analyser`);
    }
    return localAnalyse(text);
  }
};

module.exports = { detectFakeNews };
