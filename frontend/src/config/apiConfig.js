/**
 * API Configuration
 * 
 * This file centralizes all API endpoints for easier management.
 */

// Base API URL - this should be your backend server
const API_BASE_URL = 'https://autopromote.onrender.com';

// Auth endpoints
const AUTH_ENDPOINTS = {
  login: `${API_BASE_URL}/api/auth/login`,
  register: `${API_BASE_URL}/api/auth/register`,
  verify: `${API_BASE_URL}/api/auth/verify`,
  refreshToken: `${API_BASE_URL}/api/auth/refresh-token`,
};

// Content endpoints
const CONTENT_ENDPOINTS = {
  upload: `${API_BASE_URL}/api/content/upload`,
  myContent: `${API_BASE_URL}/api/content/my-content`,
  getContent: (id) => `${API_BASE_URL}/api/content/${id}`,
};

// Admin endpoints
const ADMIN_ENDPOINTS = {
  analytics: `${API_BASE_URL}/api/admin/analytics/overview`,
  users: `${API_BASE_URL}/api/admin/users`,
  content: `${API_BASE_URL}/api/admin/content`,
};

// Export all endpoints
export {
  API_BASE_URL,
  AUTH_ENDPOINTS,
  CONTENT_ENDPOINTS,
  ADMIN_ENDPOINTS,
};
