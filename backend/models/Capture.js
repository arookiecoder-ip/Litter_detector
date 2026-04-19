// models/Capture.js
const mongoose = require('mongoose');

const CaptureSchema = new mongoose.Schema({
  // Stored image reference in GridFS
  imageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Image',
    required: true,
  },

  // Detection data
  litterDetected: [{
    class: { type: String, required: true },
    confidence: { type: Number, required: true, min: 0, max: 1 },
    bbox: {
      x: Number,
      y: Number,
      width: Number,
      height: Number,
    },
  }],

  personDetected: {
    count: { type: Number, default: 0 },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
  },

  // GPS location data
  location: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    address: { type: String, maxlength: 255 },
  },

  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },

  // Relations
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  // Status lifecycle
  status: {
    type: String,
    enum: ['pending', 'verified', 'dismissed', 'resolved'],
    default: 'pending',
  },

  // Severity score 1–10
  severity: {
    type: Number,
    min: 1,
    max: 10,
    default: 1,
  },

  // Automatic TTL expiry (90 days for GDPR compliance)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  },
}, { timestamps: true });

// Compound indexes
CaptureSchema.index({ reportedBy: 1, timestamp: -1 });
CaptureSchema.index({ status: 1, timestamp: -1 });

// TTL index — MongoDB deletes documents after expiresAt
CaptureSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Capture', CaptureSchema);
