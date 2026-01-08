const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        details: 'Name, email, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        error: 'User already exists',
        details: 'An account with this email already exists'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user with default role
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: 'consumer' // Default to consumer
    });

    // Save user
    await newUser.save();

    // Generate token
    const token = jwt.sign(
      { 
        id: newUser._id, 
        name: newUser.name, 
        email: newUser.email, 
        role: newUser.role 
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '30d' }
    );

    // Log successful registration
    console.info('User registered successfully', { 
      userId: newUser._id, 
      email: newUser.email, 
      role: newUser.role 
    });

    // Respond with user info and token
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      },
      token
    });
  } catch (error) {
    // Log registration error
    console.error('Registration error', { 
      error: error.message,
      stack: error.stack 
    });

    res.status(500).json({ 
      error: 'Registration failed', 
      details: error.message 
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Missing credentials',
        details: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Invalid email or password'
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ 
        error: 'Authentication failed',
        details: 'Invalid email or password'
      });
    }

    // Generate token
    const token = jwt.sign(
      { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role 
      }, 
      process.env.JWT_SECRET, 
      { expiresIn: '30d' }
    );

    // Log successful login
    console.info('User logged in successfully', { 
      userId: user._id, 
      email: user.email, 
      role: user.role 
    });

    // Respond with user info and token
    res.json({
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (error) {
    // Log login error
    console.error('Login error', { 
      error: error.message,
      stack: error.stack 
    });

    res.status(500).json({ 
      error: 'Login failed', 
      details: error.message 
    });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    res.json(user);
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Failed to retrieve user', details: error.message });
  }
};
