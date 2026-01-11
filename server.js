require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Import routes
const auth = require('./routes/auth');
const video = require('./routes/video');
const comment = require('./routes/comment');
const router = express.Router();

const app = express();



// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to database
connectDB();

// Routes
app.use('/', router.get('/', (req, res)=>(res.json({ message: 'Welcome to Beatly API' }))));
app.use('/api/auth', auth);
app.use('/api/videos', video);
app.use('/api/comments', comment);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString() 
  });
});

// Handle invalid routes
app.use((req, res, next) => {
  res.status(404).json({ 
    error: 'Route not found', 
    path: req.path 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: err.message 
  });
});

// Start server
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server };
