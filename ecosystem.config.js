// PM2 Ecosystem Config — production deployment
// Usage on server: pm2 start ecosystem.config.js --env production
// Then: pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: 'litter-detector-backend',
      script: './backend/server.js',
      cwd: './',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',

      // ── Production environment ──────────────────────────────────
      env_production: {
        NODE_ENV: 'production',
        PORT: 3005,
        HTTPS_ENABLED: 'false',

        // ⚠️  Set these on the server directly or via a secrets manager.
        // They are left blank here — fill them in on the server's .env
        // or override with: pm2 set litter-detector-backend:MONGODB_URI <uri>
        MONGODB_URI: 'mongodb://127.0.0.1:27017/litter-detection-db',

        // CORS — allow only the Vercel frontend
        ALLOWED_ORIGINS: 'https://litter-detector.vercel.app',

        // Rate limiting
        RATE_LIMIT_WINDOW_MS: '900000',
        RATE_LIMIT_MAX_REQUESTS: '100',

        // Detection thresholds
        MIN_DETECTION_CONFIDENCE: '0.5',
        LITTER_DETECTION_THRESHOLD: '0.6',
        PERSON_DETECTION_THRESHOLD: '0.5',

        MAX_FILE_SIZE: '5242880',
        UPLOAD_DIR: './uploads',
      },

      // ── Development environment (local use) ──────────────────────
      env_development: {
        NODE_ENV: 'development',
        PORT: 5000,
        HTTPS_ENABLED: 'false',
        ALLOWED_ORIGINS: 'http://localhost:3000,http://localhost:5173',
        MONGODB_URI: '',
      },
    },
  ],
};
