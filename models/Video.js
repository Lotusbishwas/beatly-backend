const mongoose = require('mongoose');

const VideoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Video title is required'],
    trim: true,
    minlength: [3, 'Title must be at least 3 characters long'],
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Video description is required'],
    trim: true,
    minlength: [10, 'Description must be at least 10 characters long'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  url: {
    type: String,
    required: [true, 'Video URL is required']
  },
  thumbnail: {
    type: String,
    default: null
  },
  tags: {
    type: [String],
    required: [true, 'At least one tag is required'],
    validate: {
      validator: function(v) {
        return v.length > 0 && v.length <= 10;
      },
      message: 'Tags must have between 1 and 10 tags'
    }
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  views: {
    type: Number,
    default: 0
  },
  likes: {
    type: Number,
    default: 0
  },
  likedBy: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  comments: { 
    type: Number, 
    default: 0 
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  methods: {
    incrementViews() {
      this.views += 1;
      return this.save();
    },
    toggleLike(userId) {
      const index = this.likedBy.indexOf(userId);
      if (index > -1) {
        // Unlike
        this.likedBy.splice(index, 1);
        this.likes -= 1;
      } else {
        // Like
        this.likedBy.push(userId);
        this.likes += 1;
      }
      return this.save();
    }
  }
});

// Ensure tags are unique and lowercase
VideoSchema.pre('save', function(next) {
  if (this.tags) {
    this.tags = [...new Set(this.tags.map(tag => tag.trim().toLowerCase()))];
  }
  next();
});

module.exports = mongoose.model('Video', VideoSchema);
