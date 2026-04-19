// routes/capture.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { validateCapture, validate } = require('../middleware/validation');
const captureController = require('../controllers/captureController');

// POST /api/capture — upload image (multipart) + detection JSON
router.post('/', auth, upload.single('image'), captureController.createCapture);

// GET /api/capture — list captures for authenticated user
router.get('/', auth, captureController.getUserCaptures);

// GET /api/capture/:id — get single capture
router.get('/:id', auth, captureController.getCapture);

// PUT /api/capture/:id — update status
router.put('/:id', auth, captureController.updateCapture);

// DELETE /api/capture/:id — remove capture + image
router.delete('/:id', auth, captureController.deleteCapture);

module.exports = router;
