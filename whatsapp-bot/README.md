# Sentinel AI — WhatsApp Fake News Detection Bot

A WhatsApp chatbot that automatically detects fake news, crime reports, and misinformation using the Sentinel AI backend. Built with **Baileys** (no official WhatsApp API required) and ready for hackathon demos.

---

## Features

- Scan a QR code once — the session persists across restarts
- Detects **plain text**, **news links (URLs)**, and **image captions**
- Sends content to the Sentinel AI backend for AI-powered analysis (Llama 3 + HuggingFace)
- Replies with: FAKE / REAL verdict, confidence %, AI reasoning
- If confidence > 90%, **auto-alerts the authority dashboard** (no manual step needed)
- Per-sender **rate limiting** (blocks spam)
- **In-memory cache** (avoids re-analysing duplicate messages)
- Auto-reconnects if WhatsApp disconnects
- Works with **Kannada + English** messages
- **Demo fallback mode** — works even when the Sentinel backend is offline

---

## Folder Structure

```
whatsapp-bot/
├── server.js               ← Entry point (starts Express + WhatsApp)
├── bot/
│   └── whatsapp.js         ← Baileys connection + message handler
├── routes/
│   └── news.js             ← REST API: /health, /check-news, /alert-authority
├── services/
│   ├── fakeNewsService.js  ← Calls Sentinel API, caches results
│   └── alertService.js     ← Files authority complaint on high confidence
├── utils/
│   ├── cache.js            ← In-memory TTL cache
│   ├── logger.js           ← Colour-coded console logger
│   ├── rateLimiter.js      ← Per-sender message throttle
│   └── urlDetector.js      ← URL regex extractor + message type classifier
├── .env.example            ← Environment variable template
└── README.md               ← This file
```

---

## Setup & Run

### 1. Install dependencies

```bash
cd whatsapp-bot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set SENTINEL_API_URL to point to your running Sentinel backend
```

### 3. Start the bot

```bash
node server.js
# or for auto-restart during dev:
npx nodemon server.js
```

### 4. Scan the QR code

On first run, a QR code appears in your terminal. Open WhatsApp on your phone:

> **Settings → Linked Devices → Link a Device**

Scan the QR code. The bot connects and is ready.

> Your session is saved in `auth_info_baileys/`. Future restarts will NOT require a new QR scan. Delete this folder to log out.

---

## REST API

| Method | Endpoint           | Description                              |
|--------|--------------------|------------------------------------------|
| GET    | `/health`          | Check bot + WhatsApp connection status   |
| POST   | `/check-news`      | Manually analyse text or a URL           |
| POST   | `/alert-authority` | Internal — auto-called on high confidence|

### Example: `/check-news`

```bash
curl -X POST http://localhost:3001/check-news \
  -H "Content-Type: application/json" \
  -d '{"text": "BREAKING: Government bans all mobile phones from midnight!"}'
```

**Response:**
```json
{
  "success": true,
  "status": "FAKE",
  "confidence": 92,
  "reason": "This news was already debunked by trusted fact-checking sources.",
  "crimeType": "Political",
  "severity": "high",
  "panicIndex": 85
}
```

---

## How It Works

```
User sends WhatsApp message
        ↓
Rate limiter checks sender (block spam)
        ↓
Message type detected: text / url / image
        ↓
Cache checked (skip duplicates)
        ↓
POST /api/analyze → Sentinel AI Backend
        ↓
Result: FAKE or REAL + confidence + reason
        ↓
If confidence ≥ 90% → POST /api/complaints → Authority Dashboard
        ↓
Formatted reply sent back to user via WhatsApp
```

---

## Environment Variables

| Variable                   | Default                     | Description                               |
|----------------------------|-----------------------------|-------------------------------------------|
| `PORT`                     | `3001`                      | REST API port                             |
| `SENTINEL_API_URL`         | `http://localhost:5000`     | Sentinel backend URL                      |
| `FAKE_CONFIDENCE_THRESHOLD`| `90`                        | Auto-alert threshold (0-100)              |
| `RATE_LIMIT_MAX`           | `10`                        | Max messages per sender per minute        |
| `RATE_LIMIT_WINDOW_MS`     | `60000`                     | Rate limit window in milliseconds         |
| `CACHE_TTL_MS`             | `600000`                    | Cache TTL (10 minutes)                    |
| `ALERT_SECRET`             | —                           | Optional secret for alert endpoint auth   |

---

## WhatsApp Reply Format

```
🚨 *FAKE NEWS DETECTED*
━━━━━━━━━━━━━━━━━━━━
📊 *Confidence:* 94%
[█████████░] 94%
📌 *Type:* 🔗 Link
⚠️ *Category:* Political
━━━━━━━━━━━━━━━━━━━━
💡 *AI Analysis:*
No official confirmation found. Domain registered 2 days ago...
━━━━━━━━━━━━━━━━━━━━

🛡️ *What to do:*
◦ Do NOT forward this message
◦ Report it to authorities
◦ Check: PIB Fact Check, AltNews, Boom

🚔 *Auto-Alert:* Authorities have been notified.

_Powered by Sentinel AI 🛡️_
```

---

## Notes

- Baileys is an unofficial WhatsApp client. Use a secondary phone number for the bot.
- This project is built for **hackathon / educational purposes**.
- For production use, consider the official WhatsApp Business API.
