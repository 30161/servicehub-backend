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
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/servicehub
PAGESPEED_API_KEY=your-pagespeed-insights-api-key
```

Set a strong `JWT_SECRET` as well. `MONGODB_URI` can point to local MongoDB during development or MongoDB Atlas for deployment. The PageSpeed key is only read by the backend and is never sent to the frontend. Keep `.env` private.

## Install and run

Install the backend dependencies and build the React dashboard:

```bash
npm install
npm --prefix performance-frontend install
npm run build
```

For local development with MongoDB installed as a Windows service, start it in an elevated PowerShell:

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
- `GET /api/latest` — returns the latest successful full report from MongoDB.
- `GET /api/history?limit=20` — returns up to 50 recent successful or failed tests with scores, metrics, and scheduler status. Add `url=<encoded-website-url>` to filter history to a site.
- `GET /api/history/:id` — returns a saved full report.

Each successful analysis is saved as a document in MongoDB's `performanceanalyses` collection. With the default connection string, this is `servicehub.performanceanalyses`. A report includes Lighthouse run metadata, all returned audit results and diagnostics, category details, field data when available, resource summaries, recommendations, and the dashboard metrics for both desktop and mobile. The dashboard's full audit section and history view read these saved results from the API.

When the backend is started as the main Node.js process, a single `node-cron` scheduler runs every minute after MongoDB connects. It tests the URL from the newest successful analysis in MongoDB; run the first test in the dashboard to establish that target. The scheduler skips a tick if a test is still running, stores failed attempts with their error and timestamp, and never replaces successful history with demo data. The dashboard polls MongoDB-backed APIs every 60 seconds, refreshes its KPI cards and graphs without a page reload, and offers **Run Test Now** for a manual test. On Render Free the service sleeps when idle, so the scheduler is not guaranteed to run continuously or exactly every minute. See the repository root README for Render configuration and Atlas migration steps.

Each new MongoDB analysis also stores a per-device `auditHealth` percentage (passed scored Lighthouse audits divided by applicable scored audits) and prioritized `riskFactors` with the audit title, score, priority, and Lighthouse guidance for what to fix. The dashboard shows the performance score as a percentage, labels scores of 90% or higher Good, and displays lower-scoring risks and their recommended fixes. The history graph compares desktop and mobile results and can chart the audit pass percentage, page load, FCP, LCP, INP, CLS, TTFB, HTTP response time, or page size over time. Its baseline chart compares the first saved result with the latest; it does not imply an optimization occurred. INP and HTTP response timing are only shown when returned by Lighthouse/PageSpeed. Graphs are rendered by the dashboard from saved MongoDB measurements; MongoDB Compass stores and displays the documents, not chart visualizations.

To begin monitoring, run the backend and dashboard, enter a public HTTP/HTTPS website URL, and click **Run Test Now**. `localhost:27017` is the MongoDB database address, not a website URL to analyze. If no valid analysis exists yet, the scheduler waits until one is saved. If the collection appears empty, confirm that the backend is connected to the same database shown in Compass (`MONGODB_URI`) and check the dashboard/API error for a PageSpeed or MongoDB failure.

The analysis route accepts HTTP or HTTPS URLs, rejects malformed or credential-bearing URLs, and reports PageSpeed timeouts and upstream errors explicitly. A working MongoDB connection is required to analyze or read history. Metrics unavailable in Google's response are returned as `null`; the dashboard displays them as unavailable rather than fabricating values. INP is included when PageSpeed provides field data.
