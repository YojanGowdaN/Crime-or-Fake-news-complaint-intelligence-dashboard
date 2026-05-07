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

/* ─── Local analyser (runs when GROQ_API_KEY is absent or Groq fails) ─────── */
const localAnalyse = (text) => {
  const lower = text.toLowerCase();

  let fakeScore     = 0;
  let credibleScore = 0;

  for (const [signal, weight] of FAKE_SIGNALS) {
    if (lower.includes(signal)) fakeScore += weight;
  }
  for (const [signal, weight] of CREDIBLE_SIGNALS) {
    if (lower.includes(signal)) credibleScore += weight;
  }

  const nonSpaceLen = text.replace(/\s/g, "").length || 1;
  const capsRatio   = (text.match(/[A-Z]/g) || []).length / nonSpaceLen;
  if (capsRatio > 0.4)  fakeScore += 3;
  else if (capsRatio > 0.25) fakeScore += 1;

  const exclCount = (text.match(/!/g) || []).length;
  if (exclCount >= 3) fakeScore += 2;
  else if (exclCount >= 1) fakeScore += 1;

  if ((text.match(/\?/g) || []).length >= 3) fakeScore += 1;

  let crime_hint = null;
  for (const [kw, cat] of CRIME_KEYWORDS) {
    if (lower.includes(kw)) { crime_hint = cat; break; }
  }

  const net = fakeScore - credibleScore;

  let confidence, is_fake;
  if      (net >= 6)  { is_fake = true;  confidence = Math.min(0.95, 0.80 + net * 0.015); }
  else if (net >= 3)  { is_fake = true;  confidence = 0.65 + net * 0.04; }
  else if (net >= 1)  { is_fake = true;  confidence = 0.52 + net * 0.05; }
  else if (net === 0) { is_fake = false; confidence = 0.50; }
  else if (net >= -3) { is_fake = false; confidence = 0.55 + Math.abs(net) * 0.05; }
  else                { is_fake = false; confidence = Math.min(0.95, 0.70 + Math.abs(net) * 0.025); }

  const reasoning = is_fake
    ? `Local analysis: ${fakeScore} misinformation signal(s) vs ${credibleScore} credibility indicator(s) detected.`
    : `Local analysis: ${credibleScore} credibility indicator(s) vs ${fakeScore} misinformation signal(s) — content appears reliable.`;

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
