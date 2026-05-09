# 🛡️ Sentinel AI — Crime & Fake News Intelligence Dashboard

> Real-time AI platform for detecting misinformation, tracking crime hotspots, and enabling citizen reporting — powered by **Llama 3.3 (70B)** via Groq.

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?style=flat-square&logo=socketdotio&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-199900?style=flat-square&logo=leaflet&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-FF6384?style=flat-square&logo=chartdotjs&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-Llama_3.3_70B-orange?style=flat-square)
![License](https://img.shields.io/badge/License-Open_for_demos-blue?style=flat-square)

---

## What is this?

Sentinel AI is a full-stack intelligence dashboard that connects citizen reporting directly to law enforcement response.

A citizen submits a suspicious news article or complaint → **Llama 3.3 (70B)** classifies it, scores its panic potential, and geo-tags it on a live heatmap → if the panic index crosses 70, an alert fires automatically to the **Authority CIMC portal** for law enforcement action.

In the background, the system continuously scrapes RSS feeds from major news sources, analyzes every headline for misinformation, and pushes everything live via Socket.IO — no page refresh needed.

---

## Features

### 🧠 AI-Powered Analysis
- **Llama 3.3 (70B) via Groq** — returns fake news probability, panic score, crime category, and full reasoning for every piece of content
- **HuggingFace cross-check** — secondary verification layer for higher confidence
- Auto-escalates to authority portal when **panic index > 70**

### 📡 Live News Feed
- Scrapes RSS from **BBC, NDTV, Times of India, The Hindu** continuously
- Click any headline to run an instant AI analysis
- Real-time alert stream with severity badges — Critical / High / Medium / Low

### 🗺️ Geo Intelligence Heatmap
- Interactive Leaflet map with color-coded markers across India
- Complaints are automatically geo-tagged from the location field
- Color legend: 🔴 High/Critical · 🟡 Medium · 🟢 Low

### 📊 Analytics Dashboard
- **Fake News Trend** — 12-hour rolling line chart
- **Crime Distribution** — doughnut chart by category (Communal, Financial, Political, Health, Other)
- **Panic Index** — 24-hour bar chart showing fear propagation over time
- Live stat cards for total alerts, fake news count, high-risk incidents, and articles scraped

### 📝 Citizen Complaint Portal
- Submit text reports with optional image or file evidence
- AI analyzes it within seconds of submission
- Submitter identity is protected end-to-end

### 🛡️ Authority CIMC Portal
- Separate secure interface (`authority.html`) for law enforcement officers
- Receives AI-analyzed complaints with recommended priority actions in real time

### 💬 WhatsApp Bot
- Citizens submit reports directly via WhatsApp message
- Bot routes them into the same backend pipeline automatically

### 🔐 Secure Access
- Login requires username + password + a math CAPTCHA (anti-spam)
- Account locks for **15 minutes** after 5 failed attempts
- Separate login flows for citizens and authority officers

---

## Project Structure

```
sentinel-ai/
│
├── index.html               # Main dashboard — citizen facing
├── authority.html           # Authority / CIMC officer portal
│
├── Backend/
│   ├── server.js            # Express + Socket.IO server
│   ├── routes/
│   │   ├── auth.js          # Login & authentication
│   │   ├── alerts.js        # Alert feed endpoints
│   │   ├── analyze.js       # Llama 3.3 + HuggingFace pipeline
│   │   ├── complaints.js    # Complaint submission & storage
│   │   └── heatmap.js       # Geo-data endpoints
│   └── package.json
│
└── whatsapp-bot/
    └── index.js             # WhatsApp bot integration
```

---

## Getting Started

### Prerequisites

- **Node.js** v18 or higher
- [Groq API key](https://console.groq.com/) — required for Llama 3.3
- [HuggingFace token](https://huggingface.co/settings/tokens) — optional, for cross-check

---

### 1. Clone the repository

```bash
git clone https://github.com/YojanGowdaN/Crime-or-Fake-news-complaint-intelligence-dashboard.git
cd Crime-or-Fake-news-complaint-intelligence-dashboard
```

### 2. Set up the backend

```bash
cd Backend
npm install
```

Create a `.env` file inside `Backend/`:

```env
PORT=5000
GROQ_API_KEY=your_groq_api_key_here
HUGGINGFACE_TOKEN=your_hf_token_here
JWT_SECRET=your_jwt_secret_here
```

Start the server:

```bash
node server.js
```

Backend runs at `http://localhost:5000`.

### 3. Launch the frontend

**Simple — open directly:**

Just open `index.html` in any modern browser.

**Recommended — serve over HTTP:**

```bash
# From the project root
python -m http.server 8080
```

Then visit `http://localhost:8080`.

> **Note:** If the backend is offline, the dashboard automatically falls back to mock data and simulated alerts — the UI stays fully functional for demos.

### 4. WhatsApp bot (optional)

```bash
cd whatsapp-bot
npm install
node index.js
```

Scan the QR code with WhatsApp to link the bot.

---

## Demo Credentials

| Role | Username | Password |
|---|---|---|
| Citizen / Analyst | `user_demo` | `Demo@2024` |
| Citizen / Analyst | `analyst_ravi` | `Ravi@2024` |
| Authority Officer | Open `authority.html` | Separate login |

---

## API Reference

**Base URL:** `http://localhost:5000`

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check |
| `POST` | `/api/auth/login` | Authenticate a user |
| `GET` | `/api/alerts` | Get current alert list |
| `GET` | `/api/heatmap` | Geo-tagged risk data points |
| `POST` | `/api/analyze` | Analyze text with Llama 3.3 |
| `POST` | `/api/complaints` | Submit a complaint report |

**Socket.IO events:**

| Event | Direction | Description |
|---|---|---|
| `new_alert` | Server → Client | New alert pushed live to dashboard |
| `complaint_analyzed` | Server → Client | AI result for a submitted complaint |

---

## AI Pipeline

```
User submits text or complaint
             │
             ▼
     ┌──────────────────┐
     │   Llama 3.3 70B  │  ← Groq API
     └────────┬─────────┘
              │  Returns:
              │  · Fake probability  (0–100%)
              │  · Panic score       (0–100%)
              │  · Panic index       (0–100%)
              │  · Crime category
              │  · Full reasoning
              ▼
     ┌──────────────────┐
     │   HuggingFace    │  ← Cross-verification
     └────────┬─────────┘
              │
              ▼
     Result shown on dashboard
     Geo-tagged → heatmap
     Panic > 70 → authority alert fired
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Charts | Chart.js |
| Maps | Leaflet.js + OpenStreetMap |
| Real-time | Socket.IO |
| HTTP | Axios |
| Typography | Orbitron · Rajdhani · Share Tech Mono |
| Backend | Node.js + Express |
| AI Engine | Llama 3.3 (70B) via Groq |
| AI Fallback | HuggingFace Inference API |
| WhatsApp | Baileys / WWebJS |

---

## Deploying

The frontend is fully static — host it on **GitHub Pages, Netlify, or Vercel**.  
The backend needs Node.js — try **Railway or Render** for free hosting.

Before going live, update the API URL in `index.html`:

```js
// Change this to your deployed backend URL
const API = 'http://localhost:5000';
```

---

## Contributing

1. Fork the repo
2. Create your branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m "Add your feature"`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## License

Free to use and modify for prototyping, demos, and hackathon purposes.

---

*Made with ⚡ by [YojanGowdaN](https://github.com/YojanGowdaN) and team — building safer communities through technology.*
