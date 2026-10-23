# ServiceHub and Pulse Web Performance

Pulse adds real desktop and mobile website audits to the existing ServiceHub Express application. The React dashboard sends analysis requests to the backend; the backend calls Google PageSpeed Insights, saves both reports in MongoDB, and returns the stored results.

## Project structure

```text
servicehub-backend/
├── server.js                     # Existing Express API and performance routes
├── models.js                     # MongoDB models, including analysis history
├── performance-analysis.js      # PageSpeed Insights requests and Lighthouse parsing
├── performance-frontend/         # React, Vite, Tailwind CSS, and Chart.js app
│   ├── src/App.jsx
│   ├── src/styles.css
│   └── package.json
├── tests/
└── .env.example
```

## Requirements

- Node.js 20.19+ or 22.12+
- MongoDB 6+ running locally or a MongoDB connection URI
- A Google PageSpeed Insights API key is recommended. Create one in Google Cloud and enable the PageSpeed Insights API. Without a key, Google's unauthenticated quota applies.

## Configure

From this directory, copy `.env.example` to `.env` and set:

```dotenv
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/servicehub
PAGESPEED_API_KEY=your-pagespeed-insights-api-key
```

The API key is only read by the backend and is never sent to the frontend. Keep `.env` private.

## Install and run

Install the existing backend dependencies once:

```bash
npm install
```

Install the dashboard dependencies:

```bash
npm --prefix performance-frontend install
```

Start MongoDB. On Windows, if MongoDB was installed as a service, run this in an elevated PowerShell:

```powershell
Start-Service MongoDB
```

Otherwise start `mongod` using your local MongoDB data directory. Then run the backend in one terminal:

```bash
npm run dev
```

Run the React development server in a second terminal:

```bash
npm --prefix performance-frontend run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Its `/api` requests are proxied to the backend on port 5000. To serve a production build from Express instead:

```bash
npm --prefix performance-frontend run build
npm start
```

Then open `http://localhost:5000/performance`.

## API

- `GET /api/health` — existing server health check.
- `POST /api/analyze` — accepts `{ "url": "https://example.com" }`; runs desktop and mobile audits, stores both in MongoDB, and returns the structured report.
- `GET /api/history?limit=20` — returns up to 50 recent analyses with scores and metrics.
- `GET /api/history/:id` — returns a saved full report.

The analysis route accepts HTTP or HTTPS URLs, rejects malformed or credential-bearing URLs, and reports PageSpeed timeouts and upstream errors explicitly. A working MongoDB connection is required to analyze or read history. Metrics unavailable in Google's response are returned as `null`; the dashboard displays them as unavailable rather than fabricating values. INP is included when PageSpeed provides field data.
