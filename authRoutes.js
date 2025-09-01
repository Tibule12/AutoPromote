const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('./supabaseClient');
const router = express.Router();

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role = 'user' } = req.body;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Insert user into database
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          name,
          email,
          password: hashedPassword,
          role,
          created_at: new Date().toISOString()
        }
      ])
      .select();
    
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: data[0].id, email: data[0].email, role: data[0].role },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: data[0].id,
        name: data[0].name,
        email: data[0].email,
        role: data[0].role
      },
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Hardcoded admin credentials
    if (email === 'admin123@gmail.com' && password === 'Admin12345') {
      const adminUser = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Admin',
        email: 'admin123@gmail.com',
        role: 'admin'
      };
      const token = jwt.sign(
        { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );
      return res.json({
        message: 'Login successful',
        user: adminUser,
        token
      });
    }
    
    // Get user from database
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1);
    
    if (error || !users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = users[0];
    
    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );
    
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Verify token endpoint
router.get('/verify', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    
    // Get user from database
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, role')
      .eq('id', decoded.userId)
      .limit(1);
    
    if (error || !users || users.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    
    res.json({
      valid: true,
      user: users[0]
    });
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
