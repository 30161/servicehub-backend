require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const cron = require('node-cron');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { initializeApp, cert, applicationDefault, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { User, Booking, GroupPool, PerformanceAnalysis, GoogleLoginChallenge } = require('./models');
const { normalizeWebsiteUrl, requestPageSpeed, PageSpeedError } = require('./performance-analysis');
let twilioClient = null;
let googleOtpEmailTransport = null;
let firebaseAdminAuth = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (err) {
  console.error('Twilio SDK unavailable:', err.message);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const JWT_SECRET = process.env.JWT_SECRET
  || (process.env.NODE_ENV === 'production' ? null : 'servicehub-dev-secret');
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const performanceFrontendDist = path.join(__dirname, 'performance-frontend', 'dist');
if (require.main === module && process.env.NODE_ENV === 'production') {
  const missingConfiguration = [];
  if (!process.env.MONGODB_URI) missingConfiguration.push('MONGODB_URI');
  if (!JWT_SECRET || JWT_SECRET.length < 32) missingConfiguration.push('JWT_SECRET (at least 32 characters)');
  if (missingConfiguration.length) {
    console.error(`Cannot start the production server. Set required environment variables: ${missingConfiguration.join(', ')}.`);
    process.exit(1);
  }
}
const PERFORMANCE_INTERVAL_MS = 60_000;
const successfulAnalysisQuery = {
  websiteUrl: { $type: 'string' },
  desktop: { $type: 'object' },
  mobile: { $type: 'object' },
  status: { $in: ['success', null] }
};
let performanceSchedulerTask = null;
let performanceAnalysisInProgress = false;
const runtimeMetricsStartedAt = new Date();
const runtimeMetrics = {
  totalRequests: 0,
  clientErrors: 0,
  serverErrors: 0,
  totalDurationMs: 0,
  maxDurationMs: 0
};

const normalizeRoles = roles => {
  const entries = Array.isArray(roles) ? roles : [roles].filter(Boolean);
  const cleaned = entries.map(role => String(role).toLowerCase()).filter(Boolean);
  return [...new Set(cleaned)];
};

const normalizeUserRoleState = user => {
  const baseRoles = normalizeRoles(user.roles && user.roles.length ? user.roles : user.role ? [user.role] : ['customer']);
  const roles = baseRoles.length ? baseRoles : ['customer'];
  const activeRole = roles.includes(user.activeRole) ? user.activeRole : roles[0];
  user.roles = roles;
  user.activeRole = activeRole;
  user.role = activeRole;
  return user;
};

const isValidCoordinate = (lat, lng) => {
  const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
  const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;
  return validLat && validLng;
};

const getAuthToken = req => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7);
};

const requireAuth = (req, res, next) => {
  try {
    const token = getAuthToken(req);
    if (!token) return res.status(401).json({ error: 'Authentication required.' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { _id: decoded.id, role: decoded.role || 'customer' };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const requireActiveBookingAccess = async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.bookingId || req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const isProvider = String(req.user._id) === String(booking.providerId);
    const isCustomer = String(req.user._id) === String(booking.customerId);
    if (!isProvider && !isCustomer) return res.status(403).json({ error: 'You are not authorized to access this booking.' });
    if (['COMPLETED', 'CANCELLED', 'REJECTED', 'FAILED'].includes(booking.status)) {
      return res.status(410).json({ error: 'This booking is no longer active.' });
    }
    req.booking = booking;
    next();
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};

io.on('connection', socket => {
  socket.on('join-video-room', roomId => {
    socket.join(roomId);
    socket.to(roomId).emit('video-peer-joined');
  });
  socket.on('join-booking-room', bookingId => {
    if (!bookingId) return;
    socket.join(`booking:${bookingId}`);
  });
  socket.on('leave-booking-room', bookingId => {
    if (!bookingId) return;
    socket.leave(`booking:${bookingId}`);
  });
  socket.on('video-offer', ({ roomId, offer }) => socket.to(roomId).emit('video-offer', offer));
  socket.on('video-answer', ({ roomId, answer }) => socket.to(roomId).emit('video-answer', answer));
  socket.on('ice-candidate', ({ roomId, candidate }) => socket.to(roomId).emit('ice-candidate', candidate));
  socket.on('leave-video-room', roomId => socket.leave(roomId));
});

app.use((req, res, next) => {
  if (req.path === '/api/metrics') return next();

  const startedAt = performance.now();
  res.once('finish', () => {
    const durationMs = Math.max(0, performance.now() - startedAt);
    runtimeMetrics.totalRequests += 1;
    runtimeMetrics.totalDurationMs += durationMs;
    runtimeMetrics.maxDurationMs = Math.max(runtimeMetrics.maxDurationMs, durationMs);
    if (res.statusCode >= 500) runtimeMetrics.serverErrors += 1;
    else if (res.statusCode >= 400) runtimeMetrics.clientErrors += 1;
  });
  next();
});

app.use(express.json());

app.get('/.well-known/ard.json', (req, res) => {
  res.type('application/json').sendFile(
    path.join(__dirname, '.well-known', 'ard.json'),
    { dotfiles: 'allow' }
  );
});

app.get(['/robots.txt', '/sitemap.xml'], (req, res) => {
  const fileName = req.path === '/robots.txt' ? 'robots.txt' : 'sitemap.xml';
  res.type(fileName === 'robots.txt' ? 'text/plain' : 'application/xml');
  res.sendFile(path.join(__dirname, fileName));
});

app.get(['/index.html', '/'], (req, res) => {
  const indexPath = path.join(__dirname, 'index.html');
  fs.readFile(indexPath, 'utf8', (error, html) => {
    if (error) return res.status(500).send('Unable to load page.');

    const verificationCode = String(process.env.GOOGLE_SITE_VERIFICATION || '').trim();
    const analyticsId = String(process.env.GOOGLE_ANALYTICS_ID || '').trim();
    const verificationTag = verificationCode
      ? `  <meta name="google-site-verification" content="${verificationCode.replace(/["&<>]/g, '')}">\n`
      : '';
    const analyticsTag = /^G-[A-Z0-9]+$/i.test(analyticsId)
      ? `  <script async src="https://www.googletagmanager.com/gtag/js?id=${analyticsId}"></script>\n`
        + `  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${analyticsId}');</script>\n`
      : '';
    res.type('html').send(html.replace('</head>', `${verificationTag}${analyticsTag}</head>`));
  });
});

app.get('/api/seo/status', (req, res) => {
  res.json({
    canonicalUrl: 'https://pro-connect-g5d5.onrender.com/',
    sitemapUrl: 'https://pro-connect-g5d5.onrender.com/sitemap.xml',
    publicPages: [
      'https://pro-connect-g5d5.onrender.com/',
      'https://pro-connect-g5d5.onrender.com/performance'
    ],
    excludedPages: [
      '/provider-dashboard.html',
      '/provider-signup.html',
      '/api/'
    ],
    searchConsoleVerificationConfigured: Boolean(String(process.env.GOOGLE_SITE_VERIFICATION || '').trim()),
    analyticsConfigured: /^G-[A-Z0-9]+$/i.test(String(process.env.GOOGLE_ANALYTICS_ID || '').trim()),
    performanceMonitoringUrl: 'https://pro-connect-g5d5.onrender.com/performance'
  });
});

app.use(express.static(__dirname));
app.use('/performance', express.static(performanceFrontendDist, { index: false }));
app.get('/performance', (req, res) => {
  res.sendFile(path.join(performanceFrontendDist, 'index.html'));
});
app.get('/performance/{*splat}', (req, res) => {
  res.sendFile(path.join(performanceFrontendDist, 'index.html'));
});
app.get('/api/config', (req, res) => {
  const projectId = process.env.FIREBASE_PROJECT_ID || '';
  const firebaseConfig = process.env.FIREBASE_API_KEY && projectId && process.env.FIREBASE_APP_ID
    ? {
      apiKey: process.env.FIREBASE_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      appId: process.env.FIREBASE_APP_ID
    }
    : null;
  res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '', firebaseConfig });
});

app.get('/api/health', (req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  const configured = Boolean(MONGODB_URI);
  return res.status(configured && databaseConnected ? 200 : 503).json({
    ok: configured && databaseConnected,
    service: 'ProConnect API',
    database: databaseConnected ? 'connected' : 'disconnected',
    mongodbUriConfigured: configured,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/metrics', (req, res) => {
  const uptimeSeconds = process.uptime();
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  return res.json({
    generatedAt: new Date().toISOString(),
    startedAt: runtimeMetricsStartedAt.toISOString(),
    uptimeSeconds: Math.round(uptimeSeconds * 100) / 100,
    requests: {
      total: runtimeMetrics.totalRequests,
      clientErrors: runtimeMetrics.clientErrors,
      serverErrors: runtimeMetrics.serverErrors,
      averageDurationMs: runtimeMetrics.totalRequests
        ? Math.round((runtimeMetrics.totalDurationMs / runtimeMetrics.totalRequests) * 100) / 100
        : 0,
      maxDurationMs: Math.round(runtimeMetrics.maxDurationMs * 100) / 100
    },
    process: {
      nodeVersion: process.version,
      memoryBytes: {
        rss: memoryUsage.rss,
        heapTotal: memoryUsage.heapTotal,
        heapUsed: memoryUsage.heapUsed,
        external: memoryUsage.external
      },
      cpuMicroseconds: {
        user: cpuUsage.user,
        system: cpuUsage.system
      }
    },
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

function nextPerformanceRunAt() {
  return new Date((Math.floor(Date.now() / PERFORMANCE_INTERVAL_MS) + 1) * PERFORMANCE_INTERVAL_MS);
}

async function createPerformanceAnalysis(websiteUrl, trigger) {
  const [desktop, mobile] = await Promise.all([
    requestPageSpeed(websiteUrl, 'desktop'),
    requestPageSpeed(websiteUrl, 'mobile')
  ]);
  return PerformanceAnalysis.create({
    websiteUrl,
    deviceType: 'desktop-and-mobile',
    status: 'success',
    trigger,
    desktop,
    mobile,
    analyzedAt: new Date()
  });
}

async function runScheduledPerformanceAnalysis() {
  if (performanceAnalysisInProgress || mongoose.connection.readyState !== 1) return;
  performanceAnalysisInProgress = true;
  let websiteUrl;
  try {
    const latest = await PerformanceAnalysis.findOne(successfulAnalysisQuery)
      .sort({ analyzedAt: -1 })
      .select('websiteUrl')
      .lean();
    if (!latest) {
      console.info('Scheduled performance analysis skipped: no successful website URL exists in MongoDB yet.');
      return;
    }
    websiteUrl = latest.websiteUrl;
    await createPerformanceAnalysis(websiteUrl, 'scheduled');
    console.info(`Scheduled performance analysis completed for ${websiteUrl}`);
  } catch (error) {
    console.error('Scheduled website performance analysis failed:', error.message);
    if (websiteUrl && mongoose.connection.readyState === 1) {
      try {
        await PerformanceAnalysis.create({
          websiteUrl,
          status: 'failed',
          trigger: 'scheduled',
          errorMessage: error.message,
          analyzedAt: new Date()
        });
      } catch (saveError) {
        console.error('Could not save failed scheduled performance analysis:', saveError.message);
      }
    }
  } finally {
    performanceAnalysisInProgress = false;
  }
}

function startPerformanceScheduler() {
  if (performanceSchedulerTask) return performanceSchedulerTask;
  performanceSchedulerTask = cron.schedule('* * * * *', runScheduledPerformanceAnalysis);
  console.info('Performance analysis scheduler started (every minute).');
  return performanceSchedulerTask;
}

app.post('/api/analyze', async (req, res) => {
  let websiteUrl;
  try {
    websiteUrl = normalizeWebsiteUrl(req.body && (req.body.url || req.body.websiteUrl));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Analysis history is unavailable because MongoDB is not connected.' });
  }
  if (performanceAnalysisInProgress) {
    return res.status(409).json({ error: 'A performance analysis is already running. Please try again shortly.' });
  }

  performanceAnalysisInProgress = true;
  try {
    const analysis = await createPerformanceAnalysis(websiteUrl, 'manual');

    return res.status(201).json({
      id: String(analysis._id),
      websiteUrl: analysis.websiteUrl,
      analyzedAt: analysis.analyzedAt,
      status: analysis.status,
      trigger: analysis.trigger,
      desktop: analysis.desktop,
      mobile: analysis.mobile
    });
  } catch (error) {
    try {
      await PerformanceAnalysis.create({
        websiteUrl,
        status: 'failed',
        trigger: 'manual',
        errorMessage: error.message,
        analyzedAt: new Date()
      });
    } catch (saveError) {
      console.error('Could not save failed performance analysis:', saveError.message);
    }
    if (error instanceof PageSpeedError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Website performance analysis failed:', error.message);
    return res.status(500).json({ error: 'Could not save the analysis. Please try again.' });
  } finally {
    performanceAnalysisInProgress = false;
  }
});

app.get('/api/latest', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Analysis history is unavailable because MongoDB is not connected.' });
  }
  try {
    const analysis = await PerformanceAnalysis.findOne(successfulAnalysisQuery)
      .sort({ analyzedAt: -1 })
      .lean();
    if (!analysis) return res.status(404).json({ error: 'No successful performance analysis is available yet.' });
    return res.json({
      id: String(analysis._id),
      websiteUrl: analysis.websiteUrl,
      analyzedAt: analysis.analyzedAt,
      status: analysis.status || 'success',
      trigger: analysis.trigger || 'manual',
      desktop: analysis.desktop,
      mobile: analysis.mobile
    });
  } catch (error) {
    console.error('Could not retrieve the latest performance analysis:', error.message);
    return res.status(500).json({ error: 'Could not retrieve the latest analysis.' });
  }
});

app.get('/api/history', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Analysis history is unavailable because MongoDB is not connected.' });
  }

  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
  const analysisQuery = {
    websiteUrl: { $type: 'string' },
    analyzedAt: { $type: 'date' },
    $or: [
      { status: 'failed' },
      {
        desktop: { $type: 'object' },
        mobile: { $type: 'object' },
        status: { $in: ['success', null] }
      }
    ]
  };
  if (req.query.url) {
    try {
      analysisQuery.websiteUrl = normalizeWebsiteUrl(req.query.url);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  }
  try {
    const analyses = await PerformanceAnalysis.find()
      .where(analysisQuery)
      .sort({ analyzedAt: -1 })
      .limit(limit)
      .select('websiteUrl deviceType status trigger errorMessage desktop.score desktop.metrics desktop.auditHealth mobile.score mobile.metrics mobile.auditHealth analyzedAt')
      .lean();
    return res.json({
      analyses,
      scheduler: {
        enabled: Boolean(performanceSchedulerTask),
        isRunning: performanceAnalysisInProgress,
        intervalMs: PERFORMANCE_INTERVAL_MS,
        nextRunAt: performanceSchedulerTask ? nextPerformanceRunAt() : null
      }
    });
  } catch (error) {
    console.error('Could not retrieve performance analysis history:', error.message);
    return res.status(500).json({ error: 'Could not retrieve analysis history.' });
  }
});

app.get('/api/history/:id', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Analysis history is unavailable because MongoDB is not connected.' });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid analysis ID.' });
  }

  try {
    const analysis = await PerformanceAnalysis.findById(req.params.id).lean();
    if (!analysis) return res.status(404).json({ error: 'Analysis not found.' });
    return res.json({
      id: String(analysis._id),
      websiteUrl: analysis.websiteUrl,
      analyzedAt: analysis.analyzedAt,
      status: analysis.status || 'success',
      trigger: analysis.trigger || 'manual',
      errorMessage: analysis.errorMessage || null,
      desktop: analysis.desktop,
      mobile: analysis.mobile
    });
  } catch (error) {
    console.error('Could not retrieve performance analysis:', error.message);
    return res.status(500).json({ error: 'Could not retrieve this analysis.' });
  }
});
if (!MONGODB_URI) {
  console.error('MongoDB is not configured. Set MONGODB_URI (or legacy MONGO_URI for local development).');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('✅ MongoDB connected successfully');
      if (require.main === module) startPerformanceScheduler();
    })
    .catch(err => {
      console.error('❌ MongoDB connection failed. Check MONGODB_URI and Atlas network access.');
      console.error(err.message);
    });
}

function getFirebaseAdminAuth() {
  if (firebaseAdminAuth) return firebaseAdminAuth;

  const existingApp = getApps().find(firebaseApp => firebaseApp.name === 'servicehub-auth');
  if (existingApp) {
    firebaseAdminAuth = getAuth(existingApp);
    return firebaseAdminAuth;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credential = serviceAccountJson
    ? cert(JSON.parse(serviceAccountJson))
    : applicationDefault();
  const firebaseApp = initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID || undefined
  }, 'servicehub-auth');
  firebaseAdminAuth = getAuth(firebaseApp);
  return firebaseAdminAuth;
}

function getGoogleOtpEmailTransport() {
  if (googleOtpEmailTransport) return googleOtpEmailTransport;

  const port = Number(process.env.SMTP_PORT || 587);
  if (!process.env.SMTP_HOST || !Number.isInteger(port) || port < 1 || port > 65535 || !process.env.SMTP_FROM_EMAIL) {
    throw new Error('SMTP_HOST, SMTP_PORT, and SMTP_FROM_EMAIL are required for email OTP.');
  }
  if (Boolean(process.env.SMTP_USER) !== Boolean(process.env.SMTP_PASSWORD)) {
    throw new Error('SMTP_USER and SMTP_PASSWORD must both be configured or both be empty.');
  }

  const options = {
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465
  };
  if (process.env.SMTP_USER) {
    options.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD };
  }
  googleOtpEmailTransport = nodemailer.createTransport(options);
  return googleOtpEmailTransport;
}

function googleOtpDigest(identityKey, otp) {
  return crypto.createHmac('sha256', JWT_SECRET || 'servicehub-dev-secret')
    .update(`${identityKey}:${otp}`)
    .digest('hex');
}

function maskEmail(email) {
  const [localPart, domain] = email.split('@');
  const visibleLocalPart = localPart.length > 2
    ? `${localPart[0]}***${localPart[localPart.length - 1]}`
    : `${localPart[0]}***`;
  return `${visibleLocalPart}@${domain}`;
}

function createGoogleUserProfiles(service) {
  return {
    customerProfile: {
      preferences: [],
      savedAddresses: [],
      bookingHistory: [],
      reviewsGiven: [],
      favoriteProviders: []
    },
    providerProfile: {
      profilePhoto: '',
      servicesOffered: service ? [service] : [],
      serviceCategory: service || '',
      description: '',
      skills: [],
      experience: '',
      pricing: '',
      availability: '',
      serviceLocation: '',
      ratings: 5.0,
      verificationStatus: 'pending',
      bankDetails: {}
    }
  };
}

app.post('/api/auth/google/start', async (req, res) => {
  const { idToken } = req.body || {};
  const role = String(req.body && req.body.role || '').toLowerCase();
  if (typeof idToken !== 'string' || !idToken || !['customer', 'provider'].includes(role)) {
    return res.status(400).json({ error: 'A Google ID token and a valid account type are required.' });
  }

  let firebaseAuth;
  try {
    firebaseAuth = getFirebaseAdminAuth();
  } catch (error) {
    console.error('Google sign-in is unavailable because Firebase Admin is not configured:', error.message);
    return res.status(503).json({ error: 'Google sign-in is not configured. Please contact the site administrator.' });
  }

  let identity;
  try {
    identity = await firebaseAuth.verifyIdToken(idToken);
  } catch (error) {
    if (error.code && error.code.startsWith('auth/')) {
      return res.status(401).json({ error: 'Google sign-in could not verify your account. Please try again.' });
    }
    console.error('Firebase could not verify a Google sign-in token:', error.message);
    return res.status(503).json({ error: 'Google sign-in is temporarily unavailable. Please try again.' });
  }

  const email = String(identity.email || '').trim().toLowerCase();
  if (identity.firebase?.sign_in_provider !== 'google.com' || !identity.email_verified || !email) {
    return res.status(401).json({ error: 'Use a verified Google account to continue.' });
  }

  let emailTransport;
  try {
    emailTransport = getGoogleOtpEmailTransport();
  } catch (error) {
    console.error('Google sign-in email OTP is not configured:', error.message);
    return res.status(503).json({ error: 'Email verification is not configured. Please contact the site administrator.' });
  }

  const now = new Date();
  const recentChallenge = await GoogleLoginChallenge.findOne({
    email,
    sentAt: { $gt: new Date(now.getTime() - 60_000) }
  });
  if (recentChallenge) {
    return res.status(429).json({ error: 'A verification code was sent recently. Please wait one minute before trying again.' });
  }

  const otp = String(crypto.randomInt(100000, 1000000));
  const service = String(req.body.service || '').trim().slice(0, 120);
  const challenge = await GoogleLoginChallenge.findOneAndUpdate(
    { email },
    {
      $set: {
        name: String(identity.name || '').trim() || email.split('@')[0],
        role,
        service,
        otpHash: googleOtpDigest(email, otp),
        attempts: 0,
        claimedAt: null,
        sentAt: now,
        expiresAt: new Date(now.getTime() + 10 * 60_000)
      },
      $setOnInsert: { email }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  try {
    const fromName = process.env.SMTP_FROM_NAME || 'ProConnect';
    await emailTransport.sendMail({
      from: `"${fromName}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: 'Your ProConnect sign-in code',
      text: `Your ProConnect verification code is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your ProConnect verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>`
    });
  } catch (error) {
    await GoogleLoginChallenge.deleteOne({ _id: challenge._id });
    console.error('Could not send Google sign-in email OTP:', error.message);
    return res.status(502).json({ error: 'Could not send the verification email. Please try again later.' });
  }

  return res.status(202).json({
    challengeId: challenge._id,
    email: maskEmail(email),
    expiresInSeconds: 600
  });
});

app.post('/api/auth/google/verify', async (req, res) => {
  const { challengeId, otp } = req.body || {};
  if (!mongoose.isValidObjectId(challengeId) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: 'A valid challenge ID and six-digit verification code are required.' });
  }

  const now = new Date();
  const pendingChallenge = await GoogleLoginChallenge.findById(challengeId);
  if (!pendingChallenge) {
    return res.status(401).json({ error: 'The verification code is incorrect or expired.' });
  }
  const otpHash = googleOtpDigest(pendingChallenge.email, otp);
  const challenge = await GoogleLoginChallenge.findOneAndUpdate(
    {
      _id: challengeId,
      otpHash,
      expiresAt: { $gt: now },
      attempts: { $lt: 5 },
      claimedAt: null
    },
    { $set: { claimedAt: now } },
    { new: true }
  );

  if (!challenge) {
    const failedAttempt = await GoogleLoginChallenge.findOneAndUpdate(
      {
        _id: challengeId,
        expiresAt: { $gt: now },
        attempts: { $lt: 5 },
        claimedAt: null
      },
      { $inc: { attempts: 1 } },
      { new: true }
    );
    if (failedAttempt && failedAttempt.attempts >= 5) {
      await GoogleLoginChallenge.deleteOne({ _id: challengeId });
      return res.status(429).json({ error: 'Too many incorrect codes. Start Google sign-in again.' });
    }
    if (failedAttempt) {
      return res.status(401).json({ error: 'The verification code is incorrect or expired.' });
    }

    const currentChallenge = await GoogleLoginChallenge.findById(challengeId);
    if (currentChallenge && currentChallenge.attempts >= 5) {
      await GoogleLoginChallenge.deleteOne({ _id: challengeId });
      return res.status(429).json({ error: 'Too many incorrect codes. Start Google sign-in again.' });
    }
    return res.status(401).json({ error: 'The verification code is incorrect or expired.' });
  }

  try {
    let user = await User.findOne({ email: challenge.email });
    if (!user) {
      const profiles = createGoogleUserProfiles(challenge.service);
      user = await User.create({
        name: challenge.name,
        email: challenge.email,
        password: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        roles: [challenge.role],
        activeRole: challenge.role,
        role: challenge.role,
        ...profiles
      });
    } else {
      user.roles = normalizeRoles([...user.roles, challenge.role]);
      if (challenge.role === 'provider' && !user.providerProfile) {
        user.providerProfile = createGoogleUserProfiles(challenge.service).providerProfile;
      } else if (challenge.role === 'provider' && challenge.service && !user.providerProfile.serviceCategory) {
        user.providerProfile.serviceCategory = challenge.service;
        user.providerProfile.servicesOffered = [challenge.service];
      }
      if (!user.customerProfile) {
        user.customerProfile = createGoogleUserProfiles('').customerProfile;
      }
      user.activeRole = challenge.role;
      user.role = challenge.role;
      normalizeUserRoleState(user);
      await user.save();
    }

    await GoogleLoginChallenge.deleteOne({ _id: challenge._id });
    const token = jwt.sign({ id: user._id, role: user.activeRole }, JWT_SECRET);
    const safeUser = user.toObject();
    delete safeUser.password;
    return res.json({ token, user: safeUser });
  } catch (error) {
    await GoogleLoginChallenge.deleteOne({ _id: challenge._id });
    console.error('Could not complete Google sign-in:', error.message);
    return res.status(500).json({ error: 'Could not complete Google sign-in. Please try again.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, roles, service, phone, activeRole } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    const incomingRoles = normalizeRoles(roles && roles.length ? roles : [role || 'customer']);
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      existingUser.roles = normalizeRoles([...existingUser.roles, ...incomingRoles]);
      existingUser.role = existingUser.activeRole || existingUser.roles[0] || 'customer';
      existingUser.activeRole = existingUser.activeRole || existingUser.roles[0] || 'customer';
      if (!existingUser.customerProfile) existingUser.customerProfile = { preferences: [], savedAddresses: [], bookingHistory: [], reviewsGiven: [], favoriteProviders: [] };
      if (incomingRoles.includes('provider') && !existingUser.providerProfile) {
        existingUser.providerProfile = {
          profilePhoto: '',
          servicesOffered: service ? [service] : [],
          serviceCategory: service || '',
          description: '',
          skills: [],
          experience: '',
          pricing: '',
          availability: '',
          serviceLocation: '',
          ratings: 5.0,
          verificationStatus: 'pending',
          bankDetails: {}
        };
      }
      if (incomingRoles.includes('customer') && !existingUser.customerProfile) {
        existingUser.customerProfile = { preferences: [], savedAddresses: [], bookingHistory: [], reviewsGiven: [], favoriteProviders: [] };
      }
      if (activeRole && existingUser.roles.includes(activeRole)) {
        existingUser.activeRole = activeRole;
        existingUser.role = activeRole;
      }
      await existingUser.save();
      const token = jwt.sign({ id: existingUser._id, role: existingUser.activeRole }, JWT_SECRET);
      return res.status(200).json({ token, user: existingUser });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      roles: normalizeRoles(incomingRoles),
      activeRole: activeRole || normalizeRoles(incomingRoles)[0] || 'customer',
      role: activeRole || normalizeRoles(incomingRoles)[0] || 'customer',
      service,
      phone,
      customerProfile: {
        preferences: [],
        savedAddresses: [],
        bookingHistory: [],
        reviewsGiven: [],
        favoriteProviders: []
      },
      providerProfile: incomingRoles.includes('provider') ? {
        profilePhoto: '',
        servicesOffered: service ? [service] : [],
        serviceCategory: service || '',
        description: '',
        skills: [],
        experience: '',
        pricing: '',
        availability: '',
        serviceLocation: '',
        ratings: 5.0,
        verificationStatus: 'pending',
        bankDetails: {}
      } : {
        profilePhoto: '',
        servicesOffered: [],
        serviceCategory: '',
        description: '',
        skills: [],
        experience: '',
        pricing: '',
        availability: '',
        serviceLocation: '',
        ratings: 5.0,
        verificationStatus: 'pending',
        bankDetails: {}
      }
    });

    const token = jwt.sign({ id: user._id, role: user.activeRole }, JWT_SECRET);
    res.status(201).json({ token, user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    normalizeUserRoleState(user);
    const token = jwt.sign({ id: user._id, role: user.activeRole }, JWT_SECRET);
    await user.save();
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/select-role', requireAuth, async (req, res) => {
  try {
    const { role } = req.body || {};
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    const roles = normalizeUserRoleState(user).roles;
    if (!role || !roles.includes(String(role).toLowerCase())) {
      return res.status(400).json({ error: 'Selected role is not available for this account.' });
    }
    user.activeRole = String(role).toLowerCase();
    user.role = String(role).toLowerCase();
    await user.save();
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/upgrade-role', requireAuth, async (req, res) => {
  try {
    const { role } = req.body || {};
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const nextRole = String(role || 'provider').toLowerCase();
    if (!['customer', 'provider'].includes(nextRole)) {
      return res.status(400).json({ error: 'Unsupported role.' });
    }

    user.roles = normalizeRoles([...user.roles, nextRole]);
    if (nextRole === 'provider' && !user.providerProfile) {
      user.providerProfile = {
        profilePhoto: '',
        servicesOffered: [],
        serviceCategory: user.service || '',
        description: '',
        skills: [],
        experience: '',
        pricing: '',
        availability: '',
        serviceLocation: '',
        ratings: 5.0,
        verificationStatus: 'pending',
        bankDetails: {}
      };
    }
    if (nextRole === 'customer' && !user.customerProfile) {
      user.customerProfile = { preferences: [], savedAddresses: [], bookingHistory: [], reviewsGiven: [], favoriteProviders: [] };
    }
    user.activeRole = nextRole;
    user.role = nextRole;
    await user.save();
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ user });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

app.put('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { name, email, phone, password } = req.body || {};
    if (name) user.name = String(name).trim();
    if (phone) user.phone = String(phone).trim();
    if (email) user.email = String(email).trim().toLowerCase();
    if (password) user.password = await bcrypt.hash(String(password), 10);

    const existingUser = await User.findOne({ email: user.email, _id: { $ne: user._id } });
    if (existingUser) {
      return res.status(409).json({ error: 'An account with that email already exists.' });
    }

    const updatedUser = await user.save();
    const safeUser = updatedUser.toObject();
    delete safeUser.password;
    res.json({ user: safeUser });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/providers', async (req, res) => {
  const providers = await User.find({ role: 'provider' }).select('-password');
  res.json(providers);
});

app.get('/api/users/:id/favorites', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('preferredHelpers');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ favoriteIds: user.preferredHelpers.map(id => String(id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/users/:id/favorites', async (req, res) => {
  try {
    const { providerId, favorite } = req.body;
    if (!mongoose.isValidObjectId(providerId)) return res.status(400).json({ error: 'Invalid provider ID' });
    const update = favorite
      ? { $addToSet: { preferredHelpers: providerId } }
      : { $pull: { preferredHelpers: providerId } };
    const user = await User.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' }).select('preferredHelpers');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ favoriteIds: user.preferredHelpers.map(id => String(id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/providers/:id/location', async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!isValidCoordinate(Number(lat), Number(lng))) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }
    const provider = await User.findByIdAndUpdate(
      req.params.id,
      { location: { lat: Number(lat), lng: Number(lng) } },
      { returnDocument: 'after' }
    ).select('-password');

    if (!provider) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    io.emit('provider-location-updated', {
      providerId: provider._id,
      location: provider.location
    });
    res.json({ success: true, provider });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bookings/:bookingId/start-tracking', requireAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (String(req.user._id) !== String(booking.providerId)) {
      return res.status(403).json({ error: 'Only the assigned provider can start tracking for this booking.' });
    }
    if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(booking.status)) {
      return res.status(409).json({ error: 'This booking is no longer active.' });
    }

    booking.locationSharingEnabled = true;
    booking.trackingStartedAt = new Date();
    booking.trackingStoppedAt = null;
    booking.status = booking.status === 'CONFIRMED' ? 'PROVIDER_EN_ROUTE' : booking.status;
    await booking.save();

    io.to(`booking:${booking._id}`).emit('booking-location-status', {
      bookingId: booking._id,
      locationSharingEnabled: true,
      status: booking.status,
      message: 'Location sharing enabled.'
    });

    res.json({ success: true, booking });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bookings/:bookingId/stop-tracking', requireAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const isProvider = String(req.user._id) === String(booking.providerId);
    const isCustomer = String(req.user._id) === String(booking.customerId);
    if (!isProvider && !isCustomer) {
      return res.status(403).json({ error: 'You are not authorized to stop tracking for this booking.' });
    }

    booking.locationSharingEnabled = false;
    booking.trackingStoppedAt = new Date();
    await booking.save();

    io.to(`booking:${booking._id}`).emit('booking-location-status', {
      bookingId: booking._id,
      locationSharingEnabled: false,
      status: booking.status,
      message: 'Location sharing stopped.'
    });

    res.json({ success: true, booking });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/bookings/:bookingId/location', requireAuth, async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    if (String(req.user._id) !== String(booking.providerId)) {
      return res.status(403).json({ error: 'Only the assigned provider can send a live location for this booking.' });
    }
    if (!isValidCoordinate(Number(lat), Number(lng))) {
      return res.status(400).json({ error: 'Valid latitude and longitude are required.' });
    }
    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      return res.status(409).json({ error: 'Tracking is not available after the booking ends.' });
    }

    booking.latitude = Number(lat);
    booking.longitude = Number(lng);
    booking.locationUpdatedAt = new Date();
    booking.locationSharingEnabled = true;
    if (!booking.trackingStartedAt) booking.trackingStartedAt = booking.locationUpdatedAt;
    await booking.save();

    const payload = {
      bookingId: booking._id,
      providerId: booking.providerId,
      customerId: booking.customerId,
      location: { lat: booking.latitude, lng: booking.longitude },
      locationUpdatedAt: booking.locationUpdatedAt,
      locationSharingEnabled: booking.locationSharingEnabled,
      status: booking.status,
      service: booking.service
    };

    io.to(`booking:${booking._id}`).emit('booking-location-update', payload);
    io.emit('provider-location-updated', {
      providerId: booking.providerId,
      bookingId: booking._id,
      location: { lat: booking.latitude, lng: booking.longitude }
    });

    res.json({ success: true, booking: payload });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/bookings/:bookingId/location', requireAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ error: 'Booking not found.' });
    const isProvider = String(req.user._id) === String(booking.providerId);
    const isCustomer = String(req.user._id) === String(booking.customerId);
    if (!isProvider && !isCustomer) {
      return res.status(403).json({ error: 'You are not authorized to view this location.' });
    }

    if (!booking.locationSharingEnabled || !booking.latitude || !booking.longitude) {
      return res.status(200).json({
        bookingId: booking._id,
        location: null,
        locationSharingEnabled: false,
        status: booking.status,
        locationUpdatedAt: booking.locationUpdatedAt,
        message: 'Provider has not started sharing location yet.'
      });
    }

    res.json({
      bookingId: booking._id,
      providerId: booking.providerId,
      customerId: booking.customerId,
      location: { lat: booking.latitude, lng: booking.longitude },
      locationUpdatedAt: booking.locationUpdatedAt,
      locationSharingEnabled: booking.locationSharingEnabled,
      status: booking.status,
      service: booking.service,
      message: 'Live provider location available.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Add a new service / provider listing (Restricted to Providers and Admins)
app.post('/api/providers', requireAuth, async (req, res) => {
  try {
    const { name, service } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || typeof service !== 'string' || !service.trim()) {
      return res.status(400).json({ error: 'Name and service title are required.' });
    }

    const requestingUser = await User.findById(req.user._id);
    if (!requestingUser || !normalizeUserRoleState(requestingUser).roles.includes('provider')) {
      return res.status(403).json({ error: 'Only authenticated providers can update their listing.' });
    }

    requestingUser.name = name.trim();
    requestingUser.service = service.trim();
    requestingUser.providerProfile.serviceCategory = service.trim();
    requestingUser.providerProfile.servicesOffered = [service.trim()];
    await requestingUser.save();
    return res.json({
      id: requestingUser._id,
      name: requestingUser.name,
      service: requestingUser.service,
      rating: requestingUser.rating
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update service listing.' });
  }
});
app.post('/api/ai/diagnose', (req, res) => {
  const { category, symptoms } = req.body;
  let report = {
    confidence: '95%',
    probableRootCause: 'Standard wear & tear detected in internal circuits.',
    estimatedCost: '$35.00 - $55.00',
    precaution: 'Turn off the primary breaker before physical handling.'
  };

  const query = (symptoms + ' ' + category).toLowerCase();
  if (query.includes('ac') || query.includes('air conditioner') || query.includes('compressor')) {
    report = {
      confidence: '96%',
      probableRootCause: 'Defective Dual Run Capacitor (45/5 uF) or low refrigerant pressure.',
      estimatedCost: '$45.00 - $65.00',
      precaution: 'Avoid continuous restart cycles to protect compressor.'
    };
  }
  res.json(report);
});

app.post('/api/bookings', async (req, res) => {
  try {
    const payload = {
      ...req.body,
      otp: String(req.body.otp || Math.floor(100000 + Math.random() * 900000))
    };
    const booking = await Booking.create(payload);
    res.status(201).json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/bookings', async (req, res) => {
  try {
    const { email, customerId } = req.query;
    const query = email || customerId ? {
      $or: [
        ...(email ? [{ customerEmail: String(email).trim().toLowerCase() }] : []),
        ...(customerId && mongoose.isValidObjectId(customerId) ? [{ customerId }] : [])
      ]
    } : {};
    const bookings = await Booking.find(query).sort({ createdAt: -1 });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings/:id/verify-otp', requireAuth, async (req, res) => {
  try {
    const { otp } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const isProvider = String(req.user._id) === String(booking.providerId);
    const isCustomer = String(req.user._id) === String(booking.customerId);
    if (!isProvider && !isCustomer) {
      return res.status(403).json({ error: 'You are not authorized to verify this booking OTP.' });
    }

    if (String(booking.otp) !== String(otp)) {
      return res.status(400).json({ valid: false, message: 'Invalid OTP. Please confirm the one shared by the customer.' });
    }

    booking.escrowStatus = 'RELEASED_TO_PROVIDER';
    booking.status = 'COMPLETED';
    await booking.save();

    res.json({ valid: true, booking });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.get('/api/group-pools', async (req, res) => {
  try {
    let pools = await GroupPool.find().sort({ createdAt: 1 });
    if (!pools.length) {
      pools = await GroupPool.insertMany([
        { service: 'AC Service', neighborhood: 'Vellanur', targetSlots: 4, discount: '10%' },
        { service: 'Plumbing', neighborhood: 'Chromepet', targetSlots: 5, discount: '12%' },
        { service: 'Electrical Checkup', neighborhood: 'Tambaram', targetSlots: 4, discount: '15%' }
      ]);
    }
    res.json(pools.map(pool => ({
      id: pool._id,
      service: pool.service,
      neighborhood: pool.neighborhood,
      targetSlots: pool.targetSlots,
      members: pool.members.length,
      discount: pool.discount,
      status: pool.status
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/group-pools', async (req, res) => {
  const { service, neighborhood, targetSlots, discount } = req.body;
  const pool = await GroupPool.create({ service, neighborhood, targetSlots: targetSlots || 4, discount: discount || '10%' });
  res.status(201).json({ id: pool._id, service, neighborhood, targetSlots: pool.targetSlots, members: 0, discount: pool.discount });
});

app.post('/api/group-pools/:id/join', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const pool = await GroupPool.findById(req.params.id);
    if (!pool) return res.status(404).json({ error: 'Group pool not found' });
    if (!email) return res.status(400).json({ error: 'Sign in before joining a pool.' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Sign in before joining a pool.' });
    if (pool.members.some(member => String(member) === String(user._id))) {
      return res.status(409).json({ error: 'You already joined this pool.' });
    }
    if (pool.members.length >= pool.targetSlots) return res.status(409).json({ error: 'This pool is full.' });
    pool.members.push(user._id);
    await pool.save();
    res.json({ success: true, members: pool.members.length, targetSlots: pool.targetSlots });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/bookings/:id/escrow', async (req, res) => {
  const { action } = req.body;
  const status = action === 'RELEASE' ? 'RELEASED_TO_PROVIDER' : 'DISPUTED';
  const updated = await Booking.findByIdAndUpdate(req.params.id, { escrowStatus: status }, { returnDocument: 'after' });
  res.json(updated);
});

app.post('/api/calls/masked', async (req, res) => {
  const { customerPhone, providerPhone } = req.body;
  if (!customerPhone || !providerPhone) {
    return res.status(400).json({ error: 'Customer and provider phone numbers are required.' });
  }
  if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
    return res.status(503).json({ error: 'Masked calling is not configured. Add Twilio credentials to .env.' });
  }

  try {
    const call = await twilioClient.calls.create({
      to: customerPhone,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: `<Response><Dial>${providerPhone}</Dial></Response>`
    });
    res.status(201).json({ success: true, callSid: call.sid, status: call.status });
  } catch (err) {
    res.status(502).json({ error: 'Twilio could not start the masked call.', details: err.message });
  }
});

app.post('/api/sos', async (req, res) => {
  try {
    const { emergencyType, address } = req.body;
    const alert = {
      emergencyType,
      address,
      dispatchedAt: new Date().toISOString(),
      etaMinutes: 7,
      status: 'dispatched'
    };

    res.status(201).json(alert);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  const missingConfiguration = [];
  if (!MONGODB_URI) missingConfiguration.push('MONGODB_URI');
  if (missingConfiguration.length) {
    console.error(`Cannot start the server. Set required environment variables: ${missingConfiguration.join(', ')}.`);
    process.exitCode = 1;
  } else {
    server.listen(PORT, '0.0.0.0', () => console.log(`Server running on 0.0.0.0:${PORT}`));
  }
}

module.exports = { app, server, io, startPerformanceScheduler, runScheduledPerformanceAnalysis };