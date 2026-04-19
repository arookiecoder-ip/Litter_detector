// controllers/imageController.js
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

// GET /api/images/:id — stream image from GridFS
const getImage = async (req, res) => {
  try {
    const imageId = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new GridFSBucket(mongoose.connection.db);

    // Verify file exists
    const files = await bucket.find({ _id: imageId }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const file = files[0];
    res.set('Content-Type', file.contentType || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('Content-Disposition', 'inline');

    const downloadStream = bucket.openDownloadStream(imageId);

    downloadStream.on('error', (err) => {
      console.error('GridFS download error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Image download failed' });
    });

    downloadStream.pipe(res);
  } catch (err) {
    console.error('getImage error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to retrieve image' });
  }
};

module.exports = { getImage };
