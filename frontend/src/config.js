/**
 * Application Configuration
 * 
 * This file centralizes all configuration settings for the application.
 * Use these constants instead of hardcoding URLs or settings.
 */

// API Base URL - change this to your actual backend URL
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://autopromote.onrender.com';

// API Endpoints
export const API_ENDPOINTS = {
  // Auth endpoints
  LOGIN: `${API_BASE_URL}/api/auth/login`,
  REGISTER: `${API_BASE_URL}/api/auth/register`,
  ADMIN_LOGIN: `${API_BASE_URL}/api/auth/admin-login`,
  VERIFY_TOKEN: `${API_BASE_URL}/api/auth/verify`,

  // Content endpoints
  CONTENT_UPLOAD: `${API_BASE_URL}/api/content/upload`,
  MY_CONTENT: `${API_BASE_URL}/api/content/my-content`,
  MY_SCHEDULES: `${API_BASE_URL}/api/content/my-promotion-schedules`,
  
  // User endpoints
  USERS_ME: `${API_BASE_URL}/api/users/me`,
  USERS_NOTIFICATIONS: `${API_BASE_URL}/api/users/notifications`,
  
  // Admin endpoints
  ADMIN_ANALYTICS: `${API_BASE_URL}/api/admin/analytics/overview`,
  
  // Health check
  HEALTH: `${API_BASE_URL}/api/health`
};

// Firebase configuration
export const FIREBASE_CONFIG = {
  // This is loaded from .env files
};

// Feature flags
export const FEATURES = {
  ENABLE_STRIPE: false,
  ENABLE_ANALYTICS: true,
  DEBUG_MODE: process.env.NODE_ENV === 'development'
};

// Default settings
export const DEFAULTS = {
  CONTENT_PER_PAGE: 10,
  AVATAR_URL: 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png'
};
