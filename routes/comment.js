const express = require('express');
const { addComment, getComments } = require('../controllers/comment');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Add a comment to a video
router.post('/', authenticate, addComment);

// Get comments for a video
router.get('/:videoId', getComments);

module.exports = router;
