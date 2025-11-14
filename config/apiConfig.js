/**
 * API Configuration
 * 
 * This file provides the base URL for API calls based on the current environment.
 * It ensures that API calls work correctly whether running locally, on GitHub Pages,
 * or in any other deployment environment.
 */

// Determine the API base URL based on the current environment
const getApiBaseUrl = () => {
  // Check if we're running on GitHub Pages
  const isGitHubPages = window.location.hostname.includes('github.io');
  
  // For GitHub Pages deployment, always use the render.com backend
  if (isGitHubPages) {
    // Use canonical custom domain for API calls when served from GitHub Pages.
    return 'https://www.autopromote.org';
  }
  
  // For local development, check if we're using localhost
  const isLocalhost = 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1';
  
  // For local development, use local API if available, otherwise use render.com
  if (isLocalhost) {
    // You can customize this port based on your local backend
    const localApiPort = process.env.REACT_APP_API_PORT || 10000;
    
    // Check if we should force using the production API even in development
    const useProductionApi = process.env.REACT_APP_USE_PRODUCTION_API === 'true';
    
    if (useProductionApi) {
      // Force using production custom domain even in local dev.
      return 'https://www.autopromote.org';
    }
    
    return `http://${window.location.hostname}:${localApiPort}`;
  }
  
  // Default to the production API URL for all other environments
  // Default to canonical custom domain.
  return 'https://www.autopromote.org';
};

// The final API base URL to use for all API requests
export const API_BASE_URL = getApiBaseUrl();

// Helper function to construct a full API URL
export const apiUrl = (endpoint) => {
  // Make sure the endpoint starts with a slash if it doesn't already
  const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${API_BASE_URL}${formattedEndpoint}`;
};

// Debug information (will be visible in console during development)
console.log(`🔌 API configured to use: ${API_BASE_URL}`);
