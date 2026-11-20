# ProConnect – Smart Local Services

The project runs as one Express service from [`servicehub-backend/`](./servicehub-backend/). Express serves the existing ProConnect HTML experience, API, Socket.IO, and the Vite-built React performance dashboard at `/performance`.

## Run locally

In PowerShell, from the repository root:

```powershell
Set-Location .\servicehub-backend
Copy-Item .env.example .env
npm install
npm --prefix performance-frontend install
npm run build
npm run dev
```

Configure `MONGODB_URI` in `servicehub-backend/.env` with either your local MongoDB URI or Atlas connection string and set a private `JWT_SECRET`. The website is at `http://localhost:5000/`, the performance dashboard at `http://localhost:5000/performance`, and health at `http://localhost:5000/api/health`. Vite can also be run separately with `npm --prefix performance-frontend run dev`.

## Deploy one free Render Web Service

Push this repository to GitHub, create a **Web Service** in Render, then use:

| Setting | Value |
| --- | --- |
| Repository | Your GitHub repository |
| Root Directory | `servicehub-backend` |
| Runtime | Node |
| Build Command | `npm ci && npm --prefix performance-frontend ci && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

Set these in Render's **Environment**:

| Key | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Your MongoDB Atlas connection string, using database `servicehub` |
| `JWT_SECRET` | A unique random secret of at least 32 characters |
| `PAGESPEED_API_KEY` | Optional; a private Google PageSpeed Insights API key |
| `GOOGLE_MAPS_API_KEY` | Optional browser key; restrict by deployed website referrer in Google Cloud |
| `TWILIO_ACCOUNT_SID` | Optional; only if masked calling is configured |
| `TWILIO_AUTH_TOKEN` | Optional; only if masked calling is configured |
| `TWILIO_PHONE_NUMBER` | Optional; only if masked calling is configured |

Render supplies `PORT`; the server binds to `0.0.0.0`. Do not put secrets in the repository or frontend variables. The Atlas URI, JWT secret, PageSpeed key, and Twilio credentials are server-only. Use Render's generated `https://<service-name>.onrender.com/` URL for ProConnect and `/performance` for the dashboard.

### Create MongoDB Atlas and migrate local data

1. Create a free Atlas account and M0 cluster. Create a database user with a strong unique password, and add the database `servicehub` to its connection string.
2. In Atlas Network Access, allow the Render service to connect. Render's free service does not provide a stable outbound IP; if a broad `0.0.0.0/0` allow-list is needed, use a least-privilege database user, a strong password, TLS, and never reuse production credentials elsewhere.
3. Copy the Atlas driver URI into Render's `MONGODB_URI` environment variable. URL-encode reserved characters in the database username/password. Never commit the URI.
4. To migrate a local database, install MongoDB Database Tools and run these commands in PowerShell. The first command creates a local dump and does not delete or modify the source database. Replace the example Atlas URI with your real URI (do not commit or share it):

   ```powershell
   Set-Location .\servicehub-backend
   mongodump --uri "mongodb://127.0.0.1:27017/servicehub" --out .\atlas-migration
   mongorestore --uri "mongodb+srv://<db-user>:<db-password>@<cluster-host>/servicehub?retryWrites=true&w=majority" .\atlas-migration\servicehub
   ```

   If a destination collection already contains data, review it before restoring; do not use `--drop` unless you intentionally want to replace it. The `atlas-migration/` dump directory is git-ignored. Do not run `seed.js` against production; it deletes existing provider records before adding sample data.

### Test the deployed service

After Render reports the service as live:

- Open `https://<service-name>.onrender.com/` and verify the existing ProConnect UI loads.
- Open `/provider-signup.html` and `/provider-dashboard.html` to check those flows load from the same origin.
- Open `/performance`; submit a public website URL with **Run Test Now** to save the initial real analysis.
- Check `/api/health` for `ok: true` and `database: "connected"`. Confirm documents appear in Atlas `servicehub.performanceanalyses`.
- Refresh a nested dashboard URL and verify the React app is still served. Confirm historical graphs use saved records, without demo data.

### Performance scheduler on Render Free

The backend's `node-cron` scheduler is implemented and starts once per backend process after MongoDB connects. It re-tests the most recently successful website and stores real test results/errors in MongoDB. The dashboard polls the APIs every 60 seconds. However, Render's free Web Service spins down after inactivity and does not guarantee continuous background execution; the scheduler pauses while the instance sleeps and may not run at exact 60-second intervals. Continuous guaranteed monitoring requires an always-on paid service or an external scheduler/worker. Do not describe the free deployment as continuously testing every minute.

## Push changes to GitHub

From the repository root, review the staged files and push your deployment branch:

```powershell
git status
git add README.md servicehub-backend
git commit -m "Prepare ProConnect for Render deployment"
git push origin <your-branch>
```

Do not stage `.env` files, MongoDB dumps, or credentials. See [`servicehub-backend/README.md`](./servicehub-backend/README.md) for backend APIs and performance analysis details.