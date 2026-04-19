// routes/images.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getImage } = require('../controllers/imageController');

// GET /api/images/:id — serve image (requires auth)
router.get('/:id', auth, getImage);

module.exports = router;
