const Comment = require('../models/Comment');
const Video = require('../models/Video');

// Add a comment
exports.addComment = async (req, res) => {
  try {
    const { videoId, text } = req.body;

    // Validate video exists
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const comment = new Comment({
      video: videoId,
      user: req.user._id,
      text
    });

    await comment.save();

    // Optionally, you can update video's comment count if needed
    // await Video.findByIdAndUpdate(videoId, { $inc: { commentCount: 1 } });

    res.status(201).json({ 
      message: 'Comment added successfully', 
      comment: {
        id: comment._id,
        text: comment.text,
        createdAt: comment.createdAt
      }
    });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ 
      error: 'Failed to add comment', 
      details: error.message 
    });
  }
};

// Get comments for a video
exports.getComments = async (req, res) => {
  try {
    const { videoId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    // Validate video exists
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const comments = await Comment.find({ video: videoId })
      .populate('user', 'name')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Comment.countDocuments({ video: videoId });

    res.json({
      comments,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve comments', 
      details: error.message 
    });
  }
};

// Delete a comment
exports.deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user is the comment owner or an admin
    if (comment.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    await comment.remove();

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ 
      error: 'Failed to delete comment', 
      details: error.message 
    });
  }
};
