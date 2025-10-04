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
  
  // TikTok endpoints
  TIKTOK_AUTH_START: `${API_BASE_URL}/api/tiktok/auth/start`,
  TIKTOK_STATUS: `${API_BASE_URL}/api/tiktok/status`,

  // Facebook endpoints
  FACEBOOK_AUTH_START: `${API_BASE_URL}/api/facebook/auth/start`,
  FACEBOOK_STATUS: `${API_BASE_URL}/api/facebook/status`,
  FACEBOOK_UPLOAD: `${API_BASE_URL}/api/facebook/upload`,

  // YouTube endpoints
  YOUTUBE_AUTH_START: `${API_BASE_URL}/api/youtube/auth/start`,
  YOUTUBE_STATUS: `${API_BASE_URL}/api/youtube/status`,
  YOUTUBE_UPLOAD: `${API_BASE_URL}/api/youtube/upload`,

  // Instagram endpoints (via Facebook Graph)
  INSTAGRAM_STATUS: `${API_BASE_URL}/api/instagram/status`,
  INSTAGRAM_UPLOAD: `${API_BASE_URL}/api/instagram/upload`,

  // Twitter endpoints
  TWITTER_AUTH_START: `${API_BASE_URL}/api/twitter/oauth/start`,
  TWITTER_AUTH_PREPARE: `${API_BASE_URL}/api/twitter/oauth/prepare`,
  TWITTER_STATUS: `${API_BASE_URL}/api/twitter/connection/status`,
  TWITTER_TWEET_TEST: `${API_BASE_URL}/api/twitter/tweet/test`,
  TWITTER_TWEET_IMMEDIATE: `${API_BASE_URL}/api/twitter/tweet/immediate`,

  // Schedule actions (construct with ID)
  SCHEDULE_PAUSE: (id) => `${API_BASE_URL}/api/content/promotion-schedules/${id}/pause`,
  SCHEDULE_RESUME: (id) => `${API_BASE_URL}/api/content/promotion-schedules/${id}/resume`,
  SCHEDULE_RESCHEDULE: (id) => `${API_BASE_URL}/api/content/promotion-schedules/${id}/reschedule`,
  SCHEDULE_DELETE: (id) => `${API_BASE_URL}/api/content/promotion-schedules/${id}`,

  // Health check
  HEALTH: `${API_BASE_URL}/api/health`,

  // Monetization / Earnings
  EARNINGS_SUMMARY: `${API_BASE_URL}/api/monetization/earnings/summary`,
  EARNINGS_PAYOUT_SELF: `${API_BASE_URL}/api/monetization/earnings/payout/self`,
  EARNINGS_PAYOUTS: `${API_BASE_URL}/api/monetization/earnings/payouts`,
  EARNINGS_AGGREGATE_ADMIN: `${API_BASE_URL}/api/monetization/earnings/aggregate`,

  // Notifications (v2)
  NOTIFICATIONS_LIST: `${API_BASE_URL}/api/notifications`,
  NOTIFICATIONS_MARK_READ: `${API_BASE_URL}/api/notifications/read`,

  // Platform aggregated status & user progress
  PLATFORM_STATUS: `${API_BASE_URL}/api/platform/status`,
  USER_PROGRESS: `${API_BASE_URL}/api/users/progress`
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
