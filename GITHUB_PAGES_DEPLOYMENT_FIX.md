# GitHub Pages Deployment Fix

This document explains how to fix deployment issues when hosting the frontend on GitHub Pages while connecting to a separate backend API.

## The Problem

When deploying a React application to GitHub Pages, you may encounter the following issues:

1. **405 Method Not Allowed errors** when making API requests
2. **Failed login/register attempts**
3. **CORS errors** in the browser console

This happens because GitHub Pages only serves static content and doesn't support server-side functionality. When your React app tries to make API requests to endpoints like `/api/auth/login`, it's trying to access these endpoints on GitHub Pages itself, not your actual backend server.

## The Solution

### 1. Use Absolute URLs for API Endpoints

Always use absolute URLs (including the full domain) for all API requests:

```javascript
// INCORRECT - Will try to access GitHub Pages API
fetch("/api/auth/login", {
  // ...
});

// CORRECT - Uses your actual backend
fetch("https://your-backend-api.com/api/auth/login", {
  // ...
});
```

### 2. Create an API Configuration File

Use a centralized API configuration file (like `apiConfig.js`) to manage all your endpoint URLs:

```javascript
// src/config/apiConfig.js
const API_BASE_URL = "https://autopromote.onrender.com";

export const ENDPOINTS = {
  login: `${API_BASE_URL}/api/auth/login`,
  register: `${API_BASE_URL}/api/auth/register`,
  // ... other endpoints
};
```

Then import and use these URLs throughout your application:

```javascript
import { ENDPOINTS } from "../config/apiConfig";

// Use in fetch calls
fetch(ENDPOINTS.login, {
  // ...
});
```

### 3. Fix CORS Configuration

Ensure your backend server has proper CORS configuration to accept requests from your GitHub Pages domain:

```javascript
// On your Express backend
const cors = require("cors");
app.use(
  cors({
    origin: ["https://yourusername.github.io", "http://localhost:3000"],
    credentials: true,
  })
);
```

### 4. Update Homepage in package.json

Make sure your `package.json` has the correct homepage setting for GitHub Pages:

```json
{
  "name": "your-app",
  "homepage": "https://yourusername.github.io/your-repo-name"
  // ...
}
```

### 5. Configure GitHub Pages Correctly

Ensure GitHub Pages is set up to serve from the correct branch and folder:

- Go to repository Settings > Pages
- Set source to `gh-pages` branch or the `docs` folder on main branch
- Ensure you have a proper CI/CD process to build and deploy the React app

## Testing After Deployment

After deploying to GitHub Pages:

1. Open browser developer tools (F12)
2. Go to the Network tab
3. Try to login or register
4. Check that requests go to your actual backend URL, not GitHub Pages
5. Verify no CORS errors appear in the console

If you continue to experience issues, check the browser console for specific error messages.
