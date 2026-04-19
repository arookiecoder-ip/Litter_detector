// server.js — Express app entry point
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const https = require('https');
const fs = require('fs');

const connectDB = require('./config/db');
const env = require('./config/environment');

const app = express();

// ─────────────────────────────────────────────
// 1. Database connection is handled in startServer() at the bottom
// ─────────────────────────────────────────────

// Trust reverse proxies (LocalTunnel/Ngrok) to fix rate-limiting crashes
app.set('trust proxy', 1);

// ─────────────────────────────────────────────
// 2. Security Headers (helmet)
// ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      mediaSrc: ["'self'"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://storage.googleapis.com"],
      frameSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      upgradeInsecureRequests: [],
    },
  },
  hsts: env.httpsEnabled
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  noSniff: true,
  xssFilter: true,
}));

// HSTS manually (in case helmet skips it)
if (env.httpsEnabled) {
  app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    next();
  });
}

// ─────────────────────────────────────────────
// 3. CORS
// ─────────────────────────────────────────────
app.use(cors({
  origin: env.allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─────────────────────────────────────────────
// 4. Rate Limiting
// ─────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health',
});
app.use('/api/', limiter);

// ─────────────────────────────────────────────
// 5. Body Parsers
// ─────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// ─────────────────────────────────────────────
// 6. Logging
// ─────────────────────────────────────────────
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

// Disable X-Powered-By
app.disable('x-powered-by');

// ─────────────────────────────────────────────
// 7. Routes
// ─────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/capture', require('./routes/capture'));
app.use('/api/images', require('./routes/images'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
  });
});

// 404 for API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// ─────────────────────────────────────────────
// 7.5 Serve Frontend Static Files
// ─────────────────────────────────────────────
const frontendPath = path.join(__dirname, '..', 'frontend', 'public');
app.use(express.static(frontendPath));

// Fallback all other routes to index.html (SPA support)
app.use((req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ─────────────────────────────────────────────
// 8. Global Error Handler
// ─────────────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: {
      message: env.nodeEnv === 'production' ? 'Internal server error' : err.message,
      status: err.status || 500,
    },
  });
});

// ─────────────────────────────────────────────
// 9. Start Server
// ─────────────────────────────────────────────
const PORT = env.port;

const startServer = async () => {
  try {
    await connectDB();
    if (env.httpsEnabled) {
      const sslOptions = {
        key: fs.readFileSync(path.join(__dirname, 'ssl', 'private-key.pem')),
        cert: fs.readFileSync(path.join(__dirname, 'ssl', 'certificate.pem')),
      };
      https.createServer(sslOptions, app).listen(PORT, () => {
        console.log(`🔒 HTTPS Server running on https://localhost:${PORT}`);
      });
    } else {
      app.listen(PORT, () => {
        console.log(`⚠️  Server running on http://localhost:${PORT} [DEVELOPMENT]`);
      });
    }
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

// ─────────────────────────────────────────────
// 10. Scheduled Cleanup — delete captures >90 days
// ─────────────────────────────────────────────
const schedule = require('node-schedule');
const Capture = require('./models/Capture');

schedule.scheduleJob('0 2 * * *', async () => {
  try {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const result = await Capture.deleteMany({ createdAt: { $lt: ninetyDaysAgo } });
    console.log(`🧹 Cleanup: deleted ${result.deletedCount} expired captures`);
  } catch (err) {
    console.error('Cleanup job failed:', err);
  }
});

module.exports = app;
