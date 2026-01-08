# Beatly Backend

## Overview
Beatly is a modern video sharing platform backend built with Node.js, Express, and MongoDB.

## Features
- User Authentication (JWT)
- Video Upload and Management
- Like and Comment Functionality
- Role-based Access Control
- File Storage Management

## Tech Stack
- Node.js
- Express.js
- MongoDB
- Mongoose
- JSON Web Token (JWT)
- Multer (File Upload)
- Bcrypt (Password Hashing)

## Prerequisites
- Node.js (v14+)
- MongoDB (v4+)
- npm or yarn

## Installation
1. Clone the repository
```bash
git clone https://github.com/yourusername/beatly-backend.git
cd beatly-backend
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Set up environment variables
Create a `.env` file with:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/beatly
JWT_SECRET=your_jwt_secret
UPLOAD_DIR=./uploads
```

## Running the Application
### Development Mode
```bash
npm run dev
# or
yarn dev
```

### Production Mode
```bash
npm start
# or
yarn start
```

## API Endpoints
- `/api/auth/signup` - User Registration
- `/api/auth/login` - User Login
- `/api/videos` - Video CRUD Operations
- `/api/videos/:id/like` - Like/Unlike Video
- `/api/videos/:id/comment` - Add Comment

## Database Setup
- Ensure MongoDB is running
- Connection string in `.env`
- Mongoose models define data schema

## File Uploads
- Stored in `./uploads` directory
- Supports video and thumbnail uploads
- Configurable via environment variables

## Authentication
- JWT-based authentication
- Secure password hashing
- Role-based access control

## Deployment
- Set all environment variables
- Use process managers like PM2
- Configure NGINX as reverse proxy

## Troubleshooting
- Check MongoDB connection
- Verify JWT configuration
- Ensure all dependencies are installed
- Check file upload permissions

## Logging
- Morgan for HTTP request logging
- Winston for application logging

## Contributing
1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## Security
- Input validation
- Rate limiting
- CORS configuration
- Helmet for HTTP headers

## License
MIT License
