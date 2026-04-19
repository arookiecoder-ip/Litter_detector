// models/Event.js
const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  captureId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Capture',
    required: true,
  },
  type: {
    type: String,
    enum: ['litter_detected', 'capture_saved', 'status_changed', 'deleted'],
    required: true,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

EventSchema.index({ captureId: 1 });
EventSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Event', EventSchema);
