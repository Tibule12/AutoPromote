const jwt = require('jsonwebtoken');
const supabase = require('./supabaseClient');

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    console.log('Token:', token);
    if (!token) {
      console.log('No token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    console.log('Decoded JWT payload:', decoded);

    // Verify user exists in database
    const { data: users, error } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', decoded.userId)
      .limit(1);
    console.log('User lookup result:', users, error);

    if (error || !users || users.length === 0) {
      console.log('Invalid token or user not found');
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    console.log('JWT verification or DB error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = authMiddleware;
