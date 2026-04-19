// middleware/upload.js
const multer = require('multer');
const env = require('../config/environment');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Magic byte signatures for real file type verification
const MAGIC_NUMBERS = {
  'image/jpeg': [0xFF, 0xD8, 0xFF],
  'image/png':  [0x89, 0x50, 0x4E, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};

const storage = multer.memoryStorage(); // Store in memory before GridFS upload

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return cb(new Error('Invalid file type. Only JPEG, PNG, WebP allowed.'), false);
  }
  cb(null, true);
};

// Second-pass magic byte check (called after buffer is available in controller)
const verifyMagicBytes = (buffer, mimetype) => {
  const expected = MAGIC_NUMBERS[mimetype];
  if (!expected) return false;
  for (let i = 0; i < expected.length; i++) {
    if (buffer[i] !== expected[i]) return false;
  }
  return true;
};

const upload = multer({
  storage,
  limits: { fileSize: env.maxFileSize },
  fileFilter,
});

module.exports = { upload, verifyMagicBytes };
