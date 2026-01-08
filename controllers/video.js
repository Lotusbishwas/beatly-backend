const { BlobServiceClient } = require('@azure/storage-blob');
const Video = require('../models/Video');
const User = require('../models/User');
const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const sharp = require('sharp');
const winston = require('winston');

// Configure Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Azure Blob Storage Configuration
const blobServiceClient = BlobServiceClient.fromConnectionString(
  process.env.AZURE_STORAGE_CONNECTION_STRING
);
const containerClient = blobServiceClient.getContainerClient(
  process.env.AZURE_STORAGE_CONTAINER
);

// Helper function to generate thumbnail from buffer using Sharp
const generateThumbnailFromBuffer = async (videoBuffer) => {
  try {
    // Use ffmpeg to extract first frame
    return new Promise((resolve, reject) => {
      ffmpeg(videoBuffer)
        .inputOptions(['-f', 'rawvideo', '-vcodec', 'rawvideo'])
        .outputOptions([
          '-vf', 'select=eq(n\\,0)', // Select first frame
          '-vframes', '1', // Limit to 1 frame
          '-f', 'image2pipe', // Output as image pipe
          '-vcodec', 'png' // Output as PNG
        ])
        .on('error', (err) => {
          logger.error('Thumbnail generation error', { error: err.message });
          reject(err);
        })
        .pipe((thumbnailBuffer) => {
          // Resize thumbnail using Sharp
          sharp(thumbnailBuffer)
            .resize(320, 240, {
              fit: sharp.fit.cover,
              position: sharp.strategy.attention
            })
            .toBuffer((err, processedBuffer) => {
              if (err) {
                reject(err);
              } else {
                resolve(processedBuffer);
              }
            });
        });
    });
  } catch (error) {
    logger.error('Thumbnail generation failed', { error: error.message });
    throw error;
  }
};

// Helper function to upload buffer to Azure Blob Storage
const uploadBufferToAzure = async (buffer, folder, originalname, mimetype) => {
  try {
    logger.info('Starting Azure upload', { 
      folder, 
      originalname, 
      mimeType: mimetype,
      bufferSize: buffer.length 
    });

    const blobName = `${folder}/${uuidv4()}-${originalname}`;
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    // Upload directly from buffer
    const uploadResponse = await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { 
        blobContentType: mimetype 
      },
      maxConcurrency: 5, // Increase concurrency
      maxSingleShotSize: 4 * 1024 * 1024 // 4MB chunks
    });

    logger.info('Azure upload completed', { 
      blobUrl: blockBlobClient.url,
      uploadResponse 
    });

    return blockBlobClient.url;
  } catch (uploadError) {
    logger.error('Azure upload error', { 
      error: uploadError.message,
      stack: uploadError.stack 
    });
    throw uploadError;
  }
};

// Validate and sanitize tags
const validateAndSanitizeTags = (tagsInput) => {
  if (!tagsInput) {
    throw new Error('Tags are required');
  }

  // Handle both string and array inputs
  const tagsArray = Array.isArray(tagsInput) 
    ? tagsInput 
    : tagsInput.split(',');

  // Sanitize and validate tags
  const sanitizedTags = tagsArray
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0);

  if (sanitizedTags.length === 0) {
    throw new Error('At least one valid tag is required');
  }

  if (sanitizedTags.length > 10) {
    throw new Error('Maximum of 10 tags allowed');
  }

  // Remove duplicates
  return [...new Set(sanitizedTags)];
};

exports.uploadVideo = async (req, res) => {
  // Increase timeout
  req.setTimeout(5 * 60 * 1000); // 5 minutes

  try {
    logger.info('Video upload started', { 
      user: req.user._id, 
      role: req.user.role 
    });

    // Validate input
    const { title, description, tags } = req.body;
    const videoFile = req.files?.video?.[0];
    const thumbnailFile = req.files?.thumbnail?.[0];

    // Logging for debugging
    logger.info('Upload Request Details', {
      title,
      description,
      tags,
      videoFileExists: !!videoFile,
      videoFileSize: videoFile?.size,
      thumbnailFileExists: !!thumbnailFile,
      thumbnailFileSize: thumbnailFile?.size
    });

    // Validate input fields
    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    if (title.length < 3 || title.length > 100) {
      return res.status(400).json({ 
        error: 'Title must be between 3 and 100 characters' 
      });
    }

    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    if (description.length < 10 || description.length > 500) {
      return res.status(400).json({ 
        error: 'Description must be between 10 and 500 characters' 
      });
    }

    // Validate tags
    let sanitizedTags;
    try {
      sanitizedTags = validateAndSanitizeTags(tags);
    } catch (tagError) {
      return res.status(400).json({ error: tagError.message });
    }

    // Only admin can upload videos
    if (!['admin'].includes(req.user.role)) {
      logger.warn('Unauthorized video upload attempt', { 
        user: req.user._id, 
        role: req.user.role 
      });
      return res.status(403).json({ error: 'Not authorized to upload videos' });
    }

    // Validate video file
    if (!videoFile) {
      logger.error('No video file uploaded');
      return res.status(400).json({ error: 'Video file is required' });
    }

    // Upload video buffer directly to Azure
    const videoUrl = await uploadBufferToAzure(
      videoFile.buffer, 
      'videos', 
      videoFile.originalname, 
      videoFile.mimetype
    );

    // Handle thumbnail
    let thumbnailUrl = null;
    if (thumbnailFile) {
      logger.info('Using provided thumbnail', {
        originalname: thumbnailFile.originalname,
        mimetype: thumbnailFile.mimetype,
        size: thumbnailFile.size
      });

      // Upload provided thumbnail
      thumbnailUrl = await uploadBufferToAzure(
        thumbnailFile.buffer, 
        'thumbnails', 
        thumbnailFile.originalname, 
        thumbnailFile.mimetype
      );
    } else {
      // Generate thumbnail from video buffer
      try {
        const thumbnailBuffer = await generateThumbnailFromBuffer(videoFile.buffer);
        
        thumbnailUrl = await uploadBufferToAzure(
          thumbnailBuffer, 
          'thumbnails', 
          `${path.basename(videoFile.originalname, path.extname(videoFile.originalname))}_thumbnail.png`, 
          'image/png'
        );
      } catch (thumbnailError) {
        logger.error('Thumbnail generation failed', { error: thumbnailError });
        // Optional: You can choose to fail the upload or continue without thumbnail
      }
    }

    // Create video record in database
    const video = new Video({
      title,
      description,
      url: videoUrl,
      thumbnail: thumbnailUrl,
      tags: sanitizedTags,
      uploadedBy: req.user._id,
      status: req.user.role === 'admin' ? 'approved' : 'pending'
    });

    await video.save();

    logger.info('Video upload completed', { 
      videoId: video._id, 
      videoUrl, 
      thumbnailUrl 
    });

    res.status(201).json({ 
      message: 'Video uploaded successfully', 
      video: {
        id: video._id,
        title: video.title,
        url: video.url,
        thumbnail: video.thumbnail,
        tags: video.tags,
        status: video.status
      }
    });
  } catch (error) {
    logger.error('Video upload error', { 
      error: error.message,
      stack: error.stack 
    });

    res.status(500).json({ 
      error: 'Video upload failed', 
      details: error.message 
    });
  }
};

exports.getVideos = async (req, res) => {
  try {
    const { page = 1, limit = 10, tag, status } = req.query;

    // Build query based on user role and status
    const query = { status: 'approved' };
    
    if (tag) query.tags = tag;
    
    // Admin can see all videos including pending
    if (['admin'].includes(req.user.role)) {
      delete query.status;
      if (status) query.status = status;
    }

    const videos = await Video.find(query)
      .populate('uploadedBy', 'name')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Video.countDocuments(query);

    // Ensure thumbnail is always returned
    const processedVideos = videos.map(video => ({
      _id: video._id,
      title: video.title,
      description: video.description,
      url: video.url,
      thumbnail: video.thumbnail || 'https://via.placeholder.com/300x200?text=No+Thumbnail',
      tags: video.tags,
      views: video.views,
      likes: video.likes,
      uploadedBy: video.uploadedBy,
      createdAt: video.createdAt,
      status: video.status
    }));

    res.json({
      videos: processedVideos,
      totalPages: Math.ceil(total / limit),
      currentPage: page
    });
  } catch (error) {
    logger.error('Get videos error', { 
      error: error.message,
      stack: error.stack 
    });

    res.status(500).json({ 
      error: 'Failed to retrieve videos', 
      details: error.message 
    });
  }
};

exports.getVideoById = async (req, res) => {
  try {
    console.log('Getting video by id:', req.params.id);

    // Check if the ID is a valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        error: 'Invalid video ID',
        details: `Received ID: ${req.params.id}`
      });
    }

    const video = await Video.findById(req.params.id)
      .populate('uploadedBy', 'name')
      .lean();

    if (!video) {
      return res.status(404).json({ 
        error: 'Video not found',
        details: `No video found with ID: ${req.params.id}`
      });
    }

    // Only show approved videos to consumers
    if (req.user.role === 'consumer' && video.status !== 'approved') {
      logger.warn('Unauthorized video access attempt', { 
        user: req.user._id, 
        role: req.user.role, 
        videoId: video._id 
      });
      return res.status(403).json({ error: 'Video not available' });
    }

    // Increment views for approved videos
    if (video.status === 'approved') {
      await Video.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    }

    // Populate comments associated with the video
    const comments = await Comment.find({ video: req.params.id })
      .populate('user', 'name email') 
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      video,
      comments
    });
  } catch (error) {
    console.error('Get video by ID error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve video', 
      details: error.message 
    });
  }
};

exports.likeVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);

    if (!video) {
      logger.error('Video not found', { 
        videoId: req.params.id 
      });
      return res.status(404).json({ error: 'Video not found' });
    }

    // Only consumers can like videos
    if (req.user.role !== 'consumer') {
      logger.warn('Unauthorized video like attempt', { 
        user: req.user._id, 
        role: req.user.role, 
        videoId: video._id 
      });
      return res.status(403).json({ error: 'Not authorized to like videos' });
    }

    await video.toggleLike(req.user._id);

    res.json({ 
      message: 'Video like toggled', 
      likes: video.likes 
    });
  } catch (error) {
    logger.error('Like video error', { 
      error: error.message,
      stack: error.stack 
    });

    res.status(500).json({ 
      error: 'Failed to like video', 
      details: error.message 
    });
  }
};

exports.getVideoStats = async (req, res) => {
  try {
    const videoId = req.params.id;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      return res.status(400).json({ 
        error: 'Invalid video ID',
        details: `Received ID: ${videoId}`
      });
    }

    // Aggregate video statistics
    const statsAggregate = await Video.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(videoId) } },
      {
        $lookup: {
          from: 'comments', // Assuming comments collection
          localField: '_id',
          foreignField: 'video',
          as: 'videoComments'
        }
      },
      {
        $lookup: {
          from: 'users', // Assuming users collection
          localField: 'uploadedBy',
          foreignField: '_id',
          as: 'uploaderDetails'
        }
      },
      {
        $lookup: {
          from: 'users', // Join to fetch user details for comments
          localField: 'videoComments.user',
          foreignField: '_id',
          as: 'commentUsers'
        }
      },
      {
        $addFields: {
          commentsCount: { $size: '$videoComments' },
          uploaderName: { $arrayElemAt: ['$uploaderDetails.name', 0] },
          populatedComments: {
            $map: {
              input: '$videoComments',
              as: 'comment',
              in: {
                _id: '$$comment._id',
                text: '$$comment.text',
                createdAt: '$$comment.createdAt',
                User: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: '$commentUsers',
                        as: 'user',
                        cond: { $eq: ['$$user._id', '$$comment.user'] }
                      }
                    },
                    0
                  ]
                }
              }
            }
          }
        }
      },
      {
        $project: {
          title: 1,
          description: 1,
          url: 1,
          thumbnail: 1,
          views: { $ifNull: ['$views', 0] },
          likes: { $ifNull: ['$likes', 0] },
          comments: 1,
          createdAt: 1,
          uploaderName: 1,
          uploadedBy: 1,
          populatedComments: 1
        }
      }
    ]);

    if (statsAggregate.length === 0) {
      return res.status(404).json({ 
        error: 'Video not found',
        details: `No video found with ID: ${videoId}`
      });
    }

    const videoStats = statsAggregate[0];

    res.json({
      video: videoStats,
      comments: videoStats.populatedComments
    });
  } catch (error) {
    console.error('Get video stats error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve video statistics', 
      details: error.message 
    });
  }
};

exports.getVideoAnalytics = async (req, res) => {
  try {

    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20; // Default 20 videos per page
    const skip = (page - 1) * limit;

    // Filtering parameters
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.uploadedBy) {
      filter.uploadedBy = req.query.uploadedBy;
    }

    // Sorting parameters
    const sortField = req.query.sortBy || 'createdAt';
    const sortOrder = req.query.order === 'asc' ? 1 : -1;

    // Fetch videos with detailed analytics using aggregation
    const videoAggregation = await Video.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'comments', // Assuming comments collection
          localField: '_id',
          foreignField: 'video',
          as: 'videoComments'
        }
      },
      {
        $addFields: {
          comments: { $size: '$videoComments' },
          views: { $ifNull: ['$views', 0] },
          likes: { $ifNull: ['$likes', 0] }
        }
      },
      {
        $project: {
          _id: 1,
          title: 1,
          url: 1,
          thumbnail: 1,
          views: 1,
          likes: 1,
          comments: 1,
          createdAt: 1,
          status: 1,
          uploadedBy: 1
        }
      },
      { $sort: { [sortField]: sortOrder } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // Get total count for pagination
    const totalVideos = await Video.countDocuments(filter);

    // Calculate overall statistics for ALL videos (not just the current page)
    const overallStatsAggregate = await Video.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'comments',
          localField: '_id',
          foreignField: 'video',
          as: 'videoComments'
        }
      },
      {
        $group: {
          _id: null,
          totalVideos: { $sum: 1 },
          totalViews: { $sum: { $ifNull: ['$views', 0] } },
          totalLikes: { $sum: { $ifNull: ['$likes', 0] } },
          totalComments: { $sum: { $size: '$videoComments' } }
        }
      }
    ]);

    const overallStats = overallStatsAggregate[0] || {
      totalVideos: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0
    };

    console.log('Fetched videos:', videoAggregation.length);
    console.log('Total videos:', totalVideos);
    console.log('Overall stats:', overallStats);

    res.status(200).json({
      videos: videoAggregation,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalVideos / limit),
        totalVideos: totalVideos,
        limit: limit
      },
      overallStats: {
        totalVideos: overallStats.totalVideos,
        totalViews: overallStats.totalViews,
        totalLikes: overallStats.totalLikes,
        totalComments: overallStats.totalComments // Added total comments
      }
    });
  } catch (error) {
    console.error('Error fetching video analytics:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve video analytics', 
      details: error.message,
      stack: error.stack // Only for debugging
    });
  }
};

exports.deleteVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);

    if (!video) {
      logger.error('Video not found', { 
        videoId: req.params.id 
      });
      return res.status(404).json({ error: 'Video not found' });
    }

    // Only admin can delete videos
    if (req.user.role !== 'admin') {
      logger.warn('Unauthorized video deletion attempt', { 
        user: req.user._id, 
        role: req.user.role, 
        videoId: video._id 
      });
      return res.status(403).json({ error: 'Not authorized to delete videos' });
    }

    // Delete associated comments
    await Comment.deleteMany({ video: video._id });

    // Delete the video from database
    await Video.deleteOne({ _id: video._id });

    // Delete video and thumbnail from Azure Blob Storage
    try {
      const containerClient = blobServiceClient.getContainerClient(
        process.env.AZURE_STORAGE_CONTAINER
      );

      // Delete video blob
      if (video.videoUrl) {
        const videoFileName = video.videoUrl.split('/').pop();
        const videoBlockBlobClient = containerClient.getBlockBlobClient(videoFileName);
        await videoBlockBlobClient.delete();
      }

      // Delete thumbnail blob if exists
      if (video.thumbnailUrl) {
        const thumbnailFileName = video.thumbnailUrl.split('/').pop();
        const thumbnailBlockBlobClient = containerClient.getBlockBlobClient(thumbnailFileName);
        await thumbnailBlockBlobClient.delete();
      }
    } catch (storageError) {
      logger.error('Error deleting video from Azure Blob Storage', {
        videoId: video._id,
        error: storageError.message
      });
      // Log the error but don't stop the process as the database record is already deleted
    }

    res.json({ message: 'Video and associated comments deleted successfully' });
  } catch (error) {
    logger.error('Delete video error', { 
      error: error.message,
      stack: error.stack 
    });

    res.status(500).json({ 
      error: 'Failed to delete video', 
      details: error.message 
    });
  }
};
