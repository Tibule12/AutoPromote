const { db } = require('./firebaseAdmin');

// Content validation middleware
const validateContentData = (req, res, next) => {
  const {
    title,
    type,
    url,
    description,
    target_platforms,
    scheduled_promotion_time,
    promotion_frequency,
    target_rpm,
    min_views_threshold,
    max_budget
  } = req.body;

  const errors = [];

  // Required field validation
  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    errors.push('Title is required and must be a non-empty string');
  }

  if (!type || typeof type !== 'string') {
    errors.push('Type is required and must be a string');
  } else {
    const validTypes = ['article', 'video', 'image', 'audio'];
    if (!validTypes.includes(type)) {
      errors.push(`Invalid content type. Must be one of: ${validTypes.join(', ')}`);
    }
  }

  if (!url || typeof url !== 'string') {
    errors.push('URL is required and must be a string');
  } else {
    try {
      new URL(url);
    } catch (error) {
      errors.push('Invalid URL format');
    }
  }

  // Optional field validation
  if (description !== undefined && typeof description !== 'string') {
    errors.push('Description must be a string');
  }

  if (target_platforms !== undefined) {
    if (!Array.isArray(target_platforms)) {
      errors.push('Target platforms must be an array');
    } else {
  const validPlatforms = ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter', 'linkedin', 'pinterest', 'spotify', 'reddit', 'discord', 'telegram'];
      const invalidPlatforms = target_platforms.filter(platform => !validPlatforms.includes(platform));
      if (invalidPlatforms.length > 0) {
        errors.push(`Invalid platforms: ${invalidPlatforms.join(', ')}`);
      }
    }
  }

  if (scheduled_promotion_time !== undefined && scheduled_promotion_time !== null) {
    if (typeof scheduled_promotion_time !== 'string') {
      errors.push('Scheduled promotion time must be a string');
    } else {
      const date = new Date(scheduled_promotion_time);
      if (isNaN(date.getTime())) {
        errors.push('Invalid scheduled promotion time format');
      } else if (date <= new Date()) {
        errors.push('Scheduled promotion time must be in the future');
      }
    }
  }

  if (promotion_frequency !== undefined && typeof promotion_frequency !== 'string') {
    errors.push('Promotion frequency must be a string');
  } else if (promotion_frequency) {
    const validFrequencies = ['once', 'hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly'];
    if (!validFrequencies.includes(promotion_frequency)) {
      errors.push(`Invalid promotion frequency. Must be one of: ${validFrequencies.join(', ')}`);
    }
  }

  if (target_rpm !== undefined && (typeof target_rpm !== 'number' || target_rpm < 0)) {
    errors.push('Target RPM must be a non-negative number');
  }

  if (min_views_threshold !== undefined && (typeof min_views_threshold !== 'number' || min_views_threshold < 0)) {
    errors.push('Minimum views threshold must be a non-negative number');
  }

  if (max_budget !== undefined && (typeof max_budget !== 'number' || max_budget < 0)) {
    errors.push('Maximum budget must be a non-negative number');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// User validation middleware
const validateUserData = (req, res, next) => {
  const { email, name, role } = req.body;
  const errors = [];

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    errors.push('Valid email is required');
  }

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    errors.push('Name is required and must be a non-empty string');
  }

  if (role !== undefined && typeof role !== 'string') {
    errors.push('Role must be a string');
  } else if (role) {
    const validRoles = ['user', 'admin', 'moderator'];
    if (!validRoles.includes(role)) {
      errors.push(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Analytics validation middleware
const validateAnalyticsData = (req, res, next) => {
  const { content_id, event_type, timestamp, metadata } = req.body;
  const errors = [];

  if (!content_id || typeof content_id !== 'string') {
    errors.push('Content ID is required and must be a string');
  }

  if (!event_type || typeof event_type !== 'string') {
    errors.push('Event type is required and must be a string');
  } else {
    const validEventTypes = ['view', 'click', 'share', 'like', 'comment', 'follow'];
    if (!validEventTypes.includes(event_type)) {
      errors.push(`Invalid event type. Must be one of: ${validEventTypes.join(', ')}`);
    }
  }

  if (timestamp !== undefined) {
    if (typeof timestamp !== 'string') {
      errors.push('Timestamp must be a string');
    } else {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        errors.push('Invalid timestamp format');
      }
    }
  }

  if (metadata !== undefined && typeof metadata !== 'object') {
    errors.push('Metadata must be an object');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Promotion validation middleware
const validatePromotionData = (req, res, next) => {
  const {
    content_id,
    platform,
    schedule_type,
    start_time,
    frequency,
    budget,
    target_metrics
  } = req.body;

  const errors = [];

  if (!content_id || typeof content_id !== 'string') {
    errors.push('Content ID is required and must be a string');
  }

  if (!platform || typeof platform !== 'string') {
    errors.push('Platform is required and must be a string');
  } else {
  const validPlatforms = ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter', 'linkedin', 'pinterest', 'spotify', 'reddit', 'discord', 'telegram', 'all'];
    if (!validPlatforms.includes(platform)) {
      errors.push(`Invalid platform. Must be one of: ${validPlatforms.join(', ')}`);
    }
  }

  if (schedule_type !== undefined && typeof schedule_type !== 'string') {
    errors.push('Schedule type must be a string');
  } else if (schedule_type) {
    const validScheduleTypes = ['specific', 'recurring', 'continuous'];
    if (!validScheduleTypes.includes(schedule_type)) {
      errors.push(`Invalid schedule type. Must be one of: ${validScheduleTypes.join(', ')}`);
    }
  }

  if (start_time !== undefined && typeof start_time !== 'string') {
    errors.push('Start time must be a string');
  } else if (start_time) {
    const date = new Date(start_time);
    if (isNaN(date.getTime())) {
      errors.push('Invalid start time format');
    }
  }

  if (frequency !== undefined && typeof frequency !== 'string') {
    errors.push('Frequency must be a string');
  } else if (frequency) {
    const validFrequencies = ['once', 'hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'quarterly'];
    if (!validFrequencies.includes(frequency)) {
      errors.push(`Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`);
    }
  }

  if (budget !== undefined && (typeof budget !== 'number' || budget < 0)) {
    errors.push('Budget must be a non-negative number');
  }

  if (target_metrics !== undefined && typeof target_metrics !== 'object') {
    errors.push('Target metrics must be an object');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
};

// Rate limiting validation
const validateRateLimit = async (req, res, next) => {
  try {
    const userId = req.userId || (req.user && req.user.uid) || null;
    if (!userId) return next();

    const method = String(req.method || '').toLowerCase();
    const methodToOp = { post: 'create', put: 'write', patch: 'write', delete: 'write', get: 'read' };
    const operation = methodToOp[method] || 'write';
    const collectionName = (req.baseUrl || '').split('/').filter(Boolean).pop();
    if (!collectionName) return next();

    const rateLimits = {
      content: { create: { max: parseInt(process.env.RATE_LIMIT_CONTENT_CREATE || '1', 10), windowMs: 21 * 24 * 60 * 60 * 1000 } },
      analytics: { create: { max: parseInt(process.env.RATE_LIMIT_ANALYTICS_CREATE || '100', 10), windowMs: 60 * 1000 } },
      promotion_tasks: { create: { max: parseInt(process.env.RATE_LIMIT_PROMO_CREATE || '10', 10), windowMs: 24 * 60 * 60 * 1000 } },
      promotions: { create: { max: parseInt(process.env.RATE_LIMIT_PROMO_CREATE || '10', 10), windowMs: 24 * 60 * 60 * 1000 } },
    };
    const limit = (rateLimits[collectionName] || {})[operation];
    if (!limit) return next();
    const cutoff = Date.now() - (limit.windowMs || 0);
    const query = db.collection(collectionName)
      .where('user_id', '==', userId)
      .where('created_at', '>=', new Date(cutoff).toISOString())
      .limit(limit.max + 1);
    let recent = null;
    try { recent = await query.get(); } catch (_e) {
      try {
        recent = await db.collection(collectionName)
          .where('user_id', '==', userId)
          .where('createdAt', '>=', new Date(cutoff).toISOString())
          .limit(limit.max + 1)
          .get();
      } catch (e) { /* ignore and allow */ }
    }
    if (recent && recent.size >= limit.max) {
      return res.status(429).json({ error: 'rate_limit_exceeded', message: `Too many ${operation} operations on ${collectionName}. Try again later.` });
    }
    return next();
  } catch (error) {
    console.error('Rate limiting error:', error);
    return next();
  }
};

// Sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Recursively sanitize object properties
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj.trim();
    } else if (Array.isArray(obj)) {
      return obj.map(item => sanitize(item));
    } else if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitize(req.body);
  }

  next();
};

module.exports = {
  validateContentData,
  validateUserData,
  validateAnalyticsData,
  validatePromotionData,
  validateRateLimit,
  sanitizeInput
};
