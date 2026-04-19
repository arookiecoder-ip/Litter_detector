// config/environment.js
module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtExpiry: process.env.JWT_EXPIRY || '15m',
  jwtRefreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  allowedOrigins: process.env.ALLOWED_ORIGINS === '*'
    ? '*'
    : process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000'],
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  minDetectionConfidence: parseFloat(process.env.MIN_DETECTION_CONFIDENCE) || 0.5,
  litterDetectionThreshold: parseFloat(process.env.LITTER_DETECTION_THRESHOLD) || 0.6,
  personDetectionThreshold: parseFloat(process.env.PERSON_DETECTION_THRESHOLD) || 0.5,
  httpsEnabled: process.env.HTTPS_ENABLED === 'true',
};
