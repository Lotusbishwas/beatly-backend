const express = require('express');
const { 
  uploadVideo, 
  getVideos, 
  getVideoById, 
  likeVideo, 
  getVideoStats, 
  deleteVideo,
  getVideoAnalytics
} = require('../controllers/video');
const { authenticate, authorizeRoles } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Configure multer for memory storage (to upload directly to Azure)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100 MB file size limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/mpeg', 'video/quicktime', 'image/jpeg', 'image/png'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, MPEG, QuickTime videos and JPEG/PNG images are allowed.'), false);
    }
  }
});

const router = express.Router();

// Get video analytics for all videos (admins only) - MUST BE BEFORE DYNAMIC ROUTES
router.get('/all-analytics', 
  authenticate, 
  authorizeRoles('admin'), 
  getVideoAnalytics
);

// Video upload (protected: admin only)
router.post('/upload', 
  authenticate, 
  authorizeRoles('admin'), 
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ]), 
  uploadVideo
);

// Get videos (all authenticated users)
router.get('/', authenticate, getVideos);

// Get specific video (all authenticated users)
router.get('/:id', authenticate, getVideoById);

// Like video (only consumers)
router.post('/:id/like', 
  authenticate, 
  authorizeRoles('consumer'), 
  likeVideo
);

// Get video stats (admins only)
router.get('/:id/stats', 
  authenticate, 
  authorizeRoles('admin'), 
  getVideoStats
);

// Delete a video (admin only)
router.delete('/:id', 
  authenticate, 
  authorizeRoles('admin'), 
  deleteVideo
);

// Delete a video (admin only)
router.delete('/:id', 
  authenticate, 
  authorizeRoles('admin'), 
  deleteVideo
);

module.exports = router;
