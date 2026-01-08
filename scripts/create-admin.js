const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

// Hardcoded MongoDB URI (replace with your actual connection string)
const MONGO_URI = 'mongodb+srv://emkaan:JM4Zy94muzooYPUN@cluster0.hj8pb.mongodb.net/beatly';

async function createAdmin() {
  try {
    // Connect to the database
    await mongoose.connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    // Check if an admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      console.log('Admin already exists');
      await mongoose.connection.close();
      return;
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);

    // Create admin
    const admin = new User({
      name: 'Admin',
      email: 'admin@beatly.com',
      password: hashedPassword, // Hashed password
      role: 'admin'
    });

    // Save the admin
    await admin.save();

    console.log('Admin created successfully');
    await mongoose.connection.close();
  } catch (error) {
    console.error('Error creating admin:', error);
    await mongoose.connection.close();
  }
}

createAdmin();
