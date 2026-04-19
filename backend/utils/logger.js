// utils/logger.js
const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');

const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'security.log'),
      maxsize: 5 * 1024 * 1024, // 5MB rotation
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  securityLogger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf((info) => {
        const { level, message, timestamp, ...meta } = info;
        // Don't duplicate timestamp object if it exists
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
        return `${level}: ${message || ''} ${metaStr}`.trim();
      })
    ),
  }));
}

const logSecurityEvent = (event, userId, details) => {
  securityLogger.warn({ event, userId, details, timestamp: new Date().toISOString() });
};

module.exports = { securityLogger, logSecurityEvent };
