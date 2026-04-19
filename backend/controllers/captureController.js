// controllers/captureController.js
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const Capture = require('../models/Capture');
const Event = require('../models/Event');
const { verifyMagicBytes } = require('../middleware/upload');
const { securityLogger } = require('../utils/logger');

/**
 * Calculate severity score 1–10 from detection data.
 */
const calculateSeverity = (detection) => {
  const litterCount = detection.litter.length;
  const personCount = detection.people.length;
  const avgConfidence = Math.max(...detection.litter.map((l) => l.score || l.confidence || 0));
  let severity = Math.min(litterCount * 2 + personCount, 10);
  severity = Math.round(severity * avgConfidence);
  return Math.max(1, Math.min(severity, 10));
};

// POST /api/capture
const createCapture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Magic byte verification
    if (!verifyMagicBytes(req.file.buffer, req.file.mimetype)) {
      securityLogger.warn({ event: 'UPLOAD_MAGIC_MISMATCH', userId: req.user.id });
      return res.status(400).json({ error: 'File signature mismatch' });
    }

    let detection;
    try {
      detection = typeof req.body.detection === 'string'
        ? JSON.parse(req.body.detection)
        : req.body.detection;
    } catch {
      return res.status(400).json({ error: 'Invalid detection JSON' });
    }

    if (!detection || !Array.isArray(detection.litter) || detection.litter.length === 0) {
      return res.status(400).json({ error: 'Invalid detection data' });
    }

    const { latitude, longitude, address } = req.body;

    // Store in GridFS
    const bucket = new GridFSBucket(mongoose.connection.db);
    const filename = `capture-${Date.now()}-${req.user.id}.jpg`;

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: req.file.mimetype,
      metadata: {
        capturedAt: new Date(),
        userId: req.user.id,
      },
    });

    uploadStream.end(req.file.buffer);

    uploadStream.on('finish', async () => {
      try {
        const capture = new Capture({
          imageId: uploadStream.id,
          litterDetected: detection.litter.map((l) => ({
            class: l.class,
            confidence: l.score || l.confidence || 0,
            bbox: l.bbox || {},
          })),
          personDetected: {
            count: (detection.people || []).length,
            confidence: detection.people && detection.people.length > 0
              ? Math.max(...detection.people.map((p) => p.score || p.confidence || 0))
              : 0,
          },
          location: {
            latitude: latitude ? parseFloat(latitude) : undefined,
            longitude: longitude ? parseFloat(longitude) : undefined,
            address: address || undefined,
          },
          reportedBy: req.user.id,
          severity: calculateSeverity(detection),
        });

        await capture.save();

        // Log event
        await Event.create({
          captureId: capture._id,
          type: 'capture_saved',
          userId: req.user.id,
          details: { severity: capture.severity },
        });

        securityLogger.info({ event: 'CAPTURE_CREATED', captureId: capture._id, userId: req.user.id });

        res.status(201).json({
          success: true,
          id: capture._id,
          imageUrl: `/api/images/${uploadStream.id}`,
          timestamp: capture.timestamp,
          severity: capture.severity,
        });
      } catch (err) {
        console.error('Error saving capture:', err);
        res.status(500).json({ error: 'Failed to create capture record' });
      }
    });

    uploadStream.on('error', (err) => {
      console.error('GridFS upload error:', err);
      res.status(500).json({ error: 'Failed to upload image' });
    });

  } catch (err) {
    console.error('Capture creation error:', err);
    res.status(500).json({ error: 'Failed to process capture' });
  }
};

// GET /api/capture/:id
const getCapture = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid capture ID' });
    }

    const capture = await Capture.findById(req.params.id).populate('reportedBy', 'email name');

    if (!capture) return res.status(404).json({ error: 'Capture not found' });

    // Only owner can view
    if (capture.reportedBy._id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.json(capture);
  } catch (err) {
    console.error('getCapture error:', err);
    res.status(500).json({ error: 'Failed to fetch capture' });
  }
};

// GET /api/capture
const getUserCaptures = async (req, res) => {
  try {
    const { skip = 0, limit = 20, status } = req.query;
    const safeLimit = Math.min(parseInt(limit) || 20, 100);

    const query = { reportedBy: req.user.id };
    if (status) query.status = status;

    const [captures, total] = await Promise.all([
      Capture.find(query)
        .select('_id imageId timestamp location severity status litterDetected personDetected')
        .sort({ timestamp: -1 })
        .skip(parseInt(skip))
        .limit(safeLimit)
        .lean(),
      Capture.countDocuments(query),
    ]);

    res.json({ captures, total, skip: parseInt(skip), limit: safeLimit });
  } catch (err) {
    console.error('getUserCaptures error:', err);
    res.status(500).json({ error: 'Failed to fetch captures' });
  }
};

// PUT /api/capture/:id
const updateCapture = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid capture ID' });
    }

    const { status } = req.body;
    const VALID_STATUSES = ['pending', 'verified', 'dismissed', 'resolved'];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const capture = await Capture.findOneAndUpdate(
      { _id: req.params.id, reportedBy: req.user.id },
      { status },
      { new: true }
    );

    if (!capture) return res.status(404).json({ error: 'Capture not found' });

    await Event.create({ captureId: capture._id, type: 'status_changed', userId: req.user.id, details: { status } });

    res.json(capture);
  } catch (err) {
    console.error('updateCapture error:', err);
    res.status(500).json({ error: 'Failed to update capture' });
  }
};

// DELETE /api/capture/:id
const deleteCapture = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid capture ID' });
    }

    const capture = await Capture.findOneAndDelete({ _id: req.params.id, reportedBy: req.user.id });
    if (!capture) return res.status(404).json({ error: 'Capture not found' });

    // Remove from GridFS
    try {
      const bucket = new GridFSBucket(mongoose.connection.db);
      await bucket.delete(capture.imageId);
    } catch (gridErr) {
      console.warn('GridFS delete failed (image may already be removed):', gridErr.message);
    }

    await Event.create({ captureId: capture._id, type: 'deleted', userId: req.user.id });

    res.json({ success: true, message: 'Capture deleted' });
  } catch (err) {
    console.error('deleteCapture error:', err);
    res.status(500).json({ error: 'Failed to delete capture' });
  }
};

module.exports = { createCapture, getCapture, getUserCaptures, updateCapture, deleteCapture };
