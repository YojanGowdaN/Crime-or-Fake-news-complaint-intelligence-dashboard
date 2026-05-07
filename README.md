#  Crime or Fake News Complaint Intelligence Dashboard

# Sentinel AI — Intelligence Dashboard

A single-page cyber-intelligence dashboard built as a polished HTML/CSS/JS front end. It simulates live threat monitoring, fake news analysis, alerts, and a geo-heatmap interface.

## Overview

`index.html` contains a complete UI for a futuristic intelligence dashboard, including:  
- real-time alert stream and notifications  
- fake news analysis panel  
- dynamic charts and headline metrics  
- geographic heatmap view  
- complaint submission form  
- live system status display  

The interface is designed to run entirely in the browser, with optional backend integration for live data via REST and Socket.IO.

## Features

- Dashboard overview with alerts, risk indicators, panic index, and monitoring status
- Fake news analyzer with AI-style probability and confidence visualization
- Live alerts feed with severity badges and notification popups
- Geo-heatmap using Leaflet for location-based risk plotting
- Complaint submission form with file upload support
- Integrated charts using Chart.js
- Mock backend simulation for demo mode when real API is unavailable
- Animated neon cyberpunk UI with responsive layout

## Tech Stack

- HTML5
- CSS3 (custom styles with responsive support)
- JavaScript (vanilla)
- Chart.js for charts
- Leaflet for map rendering
- Axios for HTTP requests
- Socket.IO client for real-time events
- Google Fonts for typography

## How to Run

### Option 1: Open directly

You can simply open `index.html` in a browser.

### Option 2: Serve locally

For best results, serve the folder over HTTP, especially if you want to use the built-in API integration.

```bash
cd c:\Users\yojan\OneDrive\Desktop\Hackathon\Frontend
python -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Backend Integration

The dashboard expects an optional backend at `http://localhost:8000` for these endpoints:

- `GET /api/heatmap` — heatmap location data
- `GET /api/alerts` — current alert list
- `POST /api/analyze` — analyze submitted text
- `POST /api/complaints` — submit complaint reports
- Socket.IO connection to `http://localhost:8000`

If the backend is not available, the UI falls back to mock data and simulated alerts.

## Notes

- The current project contains a single file: `index.html`.
- The dashboard is intended for demo and hackathon prototyping.
- Update `BASE_URL` in the `<script>` section if your API runs on a different host or port.

## License

Use and modify freely for prototyping and demo purposes.
