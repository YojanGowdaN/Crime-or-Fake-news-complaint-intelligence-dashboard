const llamaService          = require("../services/llamaService");
const fakeNewsService       = require("../services/fakeNewsService");
const sentimentService      = require("../services/sentimentService");
const crimeDetectionService = require("../services/crimeDetectionService");
const panicService          = require("../services/panicService");
const urlScraperService     = require("../services/urlScraperService");
const whatsappService       = require("../services/whatsappService");
const logger                = require("../utils/logger");

const HELP_KEYWORDS  = ["help", "hi", "hello", "start", "/start", "hey", "namaste"];
const MAX_TEXT_CHARS = 1500;

const buildTwiML = (body) =>
  `<?xml version="1.0" encoding="UTF-8"?><Response><Message><Body>${body.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</Body></Message></Response>`;

const runAnalysisPipeline = async (text) => {
  const [llamaResult, sentimentResult, hfResult] = await Promise.all([
    llamaService.detectFakeNews(text),
    sentimentService.scorePanic(text),
    fakeNewsService.analyseText(text),
  ]);

  const llamaProb = llamaResult.is_fake
    ? Math.round(llamaResult.confidence * 100)
    : Math.round((1 - llamaResult.confidence) * 100);

  const hfProb = hfResult.label === "FAKE"
    ? Math.round(hfResult.confidence * 100)
    : Math.round((1 - hfResult.confidence) * 100);

  const fake_probability = Math.round(llamaProb * 0.7 + hfProb * 0.3);

  let { crime_type, severity } = crimeDetectionService.detectCrime(
    text,
    sentimentResult.isNegative
  );
  if (llamaResult.crime_hint && llamaResult.crime_hint !== "Unknown") {
    crime_type = llamaResult.crime_hint;
  }

  return {
    fake_probability,
    crime_type,
    severity,
    panic_score:  sentimentResult.panic_score,
    reasoning:    llamaResult.reasoning,
    confidence:   llamaResult.confidence,
    source:       llamaResult.source,
  };
};

const handleIncoming = async (req, res) => {
  try {
    const body      = req.body || {};
    const msgBody   = (body.Body || "").trim();
    const from      = body.From || "";
    const mediaUrl  = body.MediaUrl0 || null;
    const mediaType = body.MediaContentType0 || null;
    const numMedia  = parseInt(body.NumMedia || "0", 10);

    logger.info(`whatsappController → incoming from ${from}: "${msgBody.slice(0, 80)}" | media=${numMedia}`);

    if (!msgBody && numMedia === 0) {
      res.type("text/xml").send(buildTwiML("Please send a news text, URL, or image for analysis."));
      return;
    }

    const lowerMsg = msgBody.toLowerCase();
    if (HELP_KEYWORDS.some((kw) => lowerMsg === kw)) {
      res.type("text/xml").send(buildTwiML(whatsappService.buildWelcomeMessage()));
      return;
    }

    res.type("text/xml").send(buildTwiML("🔍 Analyzing your content... Please wait."));

    setImmediate(async () => {
      try {
        let textToAnalyze = msgBody;
        let title         = null;
        let sourceUrl     = null;

        if (urlScraperService.isUrl(msgBody)) {
          sourceUrl = urlScraperService.extractUrl(msgBody);
          const scraped = await urlScraperService.scrapeUrl(sourceUrl);
          textToAnalyze = scraped.text;
          title         = scraped.title;
          logger.info(`whatsappController → scraped URL: "${title}"`);
        } else if (numMedia > 0 && mediaUrl) {
          textToAnalyze = msgBody || `Image shared from ${from} — analyzing visual content`;
          title = "Image/Screenshot Submission";
          logger.info(`whatsappController → media message: ${mediaType}`);
        }

        if (!textToAnalyze || textToAnalyze.trim().length < 5) {
          await whatsappService.sendMessage(from, "⚠️ Could not extract enough content to analyze. Please send a news text or valid URL.");
          return;
        }

        const analysis = await runAnalysisPipeline(textToAnalyze.slice(0, MAX_TEXT_CHARS));

        const { panic_index } = await panicService.computePanicIndex({
          text:            textToAnalyze,
          fake_probability: analysis.fake_probability,
          panic_score:      analysis.panic_score,
          crime_type:       analysis.crime_type,
          severity:         analysis.severity,
          title,
          sourceUrl,
          reasoning:        analysis.reasoning,
          confidence:       analysis.confidence,
        });

        const replyText = whatsappService.buildAnalysisReply({
          title:           title || "Submitted Content",
          fake_probability: analysis.fake_probability,
          severity:         analysis.severity,
          crime_type:       analysis.crime_type,
          reasoning:        analysis.reasoning,
          confidence:       analysis.confidence,
          sourceUrl,
        });

        await whatsappService.sendMessage(from, replyText);
        logger.info(`whatsappController → reply sent to ${from}`);
      } catch (innerErr) {
        logger.error(`whatsappController → async analysis error: ${innerErr.message}`);
        await whatsappService.sendMessage(from, "⚠️ Analysis failed. Please try again later.");
      }
    });
  } catch (err) {
    logger.error(`whatsappController → handleIncoming error: ${err.message}`);
    if (!res.headersSent) {
      res.type("text/xml").send(buildTwiML("⚠️ System error. Please try again."));
    }
  }
};

const verifyWebhook = (req, res) => {
  res.status(200).send("Twilio webhook endpoint active — Sentinel AI WhatsApp Bot");
};

const analyzeForBot = async (req, res, next) => {
  try {
    const { text, url, phone } = req.body;
    let textToAnalyze = text;
    let title = null;
    let sourceUrl = url || null;

    if (!textToAnalyze && url) {
      const scraped = await urlScraperService.scrapeUrl(url);
      textToAnalyze = scraped.text;
      title = scraped.title;
      sourceUrl = url;
    }

    if (!textToAnalyze || textToAnalyze.trim().length < 5) {
      const err = new Error("Provide text or a valid URL for analysis");
      err.status = 400;
      return next(err);
    }

    const analysis = await runAnalysisPipeline(textToAnalyze.slice(0, MAX_TEXT_CHARS));
    const { panic_index, location } = await panicService.computePanicIndex({
      text: textToAnalyze,
      ...analysis,
      title,
      sourceUrl,
      reasoning:  analysis.reasoning,
      confidence: analysis.confidence,
    });

    res.status(200).json({
      success:         true,
      title:           title || "Submitted Content",
      fake_probability: analysis.fake_probability,
      severity:         analysis.severity,
      crime_type:       analysis.crime_type,
      reasoning:        analysis.reasoning,
      confidence:       analysis.confidence,
      panic_index,
      location,
      source:           analysis.source,
      sourceUrl,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { handleIncoming, verifyWebhook, analyzeForBot };
