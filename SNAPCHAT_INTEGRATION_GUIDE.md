# Snapchat Integration Guide

## Overview

AutoPromote integrates with Snapchat's Marketing API to enable cross-platform content distribution. This document explains how the Snapchat integration works, from OAuth authentication to content posting.

## Architecture

### Components

1. **Frontend (React)**: User interface for connecting/disconnecting Snapchat accounts
2. **Backend (Node.js/Express)**: OAuth flow handling and API communication
3. **Firebase Firestore**: Secure storage of access tokens and user connections
4. **Snapchat Marketing API**: Content creation and analytics

### Key Files

- `src/snapchatRoutes.js`: Backend API endpoints for Snapchat integration
- `frontend/src/UserDashboard_full.js`: Frontend UI components
- `frontend/src/config.js`: API endpoint configuration

## OAuth Flow

### 1. User Initiates Connection

When a user clicks "Connect Snapchat" in the dashboard:

```javascript
// Frontend calls backend to prepare OAuth
const response = await fetch('/api/snapchat/oauth/prepare', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` }
});
const { authUrl } = await response.json();

// Opens Snapchat OAuth page in popup
window.open(authUrl, 'snapchat-oauth', 'width=600,height=700');
```

### 2. Backend Prepares OAuth URL

The `/oauth/prepare` endpoint:

1. **Validates Environment**: Checks for required Snapchat credentials
2. **Generates State**: Creates secure random state for CSRF protection
3. **Stores State**: Saves state in Firestore with user ID and expiration
4. **Builds Auth URL**: Constructs Snapchat OAuth URL with proper parameters

```javascript
// Example auth URL generated:
https://accounts.snapchat.com/accounts/oauth2/auth?client_id=19410df3-3b48-490f-83f2-6d6231c18086&redirect_uri=https%3A%2F%2Fwww.autopromote.org%2Fapi%2Fsnapchat%2Fauth%2Fcallback&response_type=code&scope=snapchat-marketing-api&state=abc123
```

### 3. User Authorizes App

1. User is redirected to Snapchat's OAuth page
2. User logs in and grants permissions
3. Snapchat redirects back with authorization code

### 4. Backend Handles Callback

The `/auth/callback` endpoint:

1. **Validates State**: Ensures the state matches stored value (CSRF protection)
2. **Exchanges Code**: Trades authorization code for access token
3. **Fetches Profile**: Gets user profile information
4. **Stores Connection**: Saves tokens and profile in Firestore
5. **Redirects User**: Sends user back to dashboard with success message

```javascript
// Token exchange request
const tokenRes = await fetch('https://accounts.snapchat.com/login/oauth2/access_token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    redirect_uri: config.redirect
  })
});
```

## Data Storage

### Firestore Structure

```
users/{userId}/connections/snapchat:
{
  accessToken: "Bearer token from Snapchat",
  refreshToken: "Refresh token for token renewal",
  expiresAt: 1640995200000, // Expiration timestamp
  profile: {
    id: "snapchat_user_id",
    displayName: "User Display Name",
    // ... other profile data
  },
  connectedAt: "2024-01-01T00:00:00.000Z"
}
```

### State Management

Temporary OAuth states are stored in `oauth_states` collection:

```
oauth_states/{state}:
{
  uid: "user_id",
  platform: "snapchat",
  createdAt: "2024-01-01T00:00:00.000Z",
  expiresAt: 1640995200000
}
```

## API Endpoints

### Authentication

- `POST /api/snapchat/oauth/prepare`: Prepares OAuth URL for frontend
- `GET /api/snapchat/auth/callback`: Handles OAuth callback from Snapchat
- `GET /api/snapchat/status`: Returns connection status

### Content Management

- `POST /api/snapchat/creative`: Creates ad creative
- `GET /api/snapchat/analytics/:creativeId`: Gets performance metrics

### Debug Endpoints

- `GET /api/snapchat/_debug/authorize_probe`: Tests OAuth URL generation
- `GET /api/snapchat/_debug/authorize_probe_public`: Public OAuth URL inspection

## Security Features

### 1. State Validation

- Random UUID generated for each OAuth flow
- Stored in Firestore with expiration (10 minutes)
- Validated on callback to prevent CSRF attacks

### 2. Token Storage

- Access tokens encrypted at rest in Firestore
- Automatic token refresh handling
- Secure token exchange using Basic Auth

### 3. Environment Variables

Required environment variables:
- `SNAPCHAT_CLIENT_ID`: OAuth client ID from Snapchat
- `SNAPCHAT_CLIENT_SECRET`: OAuth client secret
- `SNAPCHAT_REDIRECT_URI`: OAuth callback URL

## Error Handling

### OAuth Errors

- **Invalid Client**: Check client ID and secret
- **Invalid Redirect URI**: Ensure URI is registered in Snapchat app
- **Expired Code**: Codes expire in 10 minutes
- **State Mismatch**: CSRF protection triggered

### API Errors

- **Token Expired**: Automatic refresh or re-authentication
- **Rate Limits**: Exponential backoff implemented
- **Network Issues**: Retry logic with timeouts

## Content Posting Flow

### 1. Creative Creation

```javascript
const creativeData = {
  name: "AutoPromote Content",
  type: "SNAP_AD",
  headline: content.title,
  description: content.description,
  media: {
    type: "IMAGE",
    url: content.mediaUrl
  },
  campaign_id: campaignId
};
```

### 2. API Request

```javascript
const response = await fetch('https://adsapi.snapchat.com/v1/adaccounts/{accountId}/creatives', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(creativeData)
});
```

### 3. Analytics Tracking

Performance metrics retrieved via:
```
GET https://adsapi.snapchat.com/v1/creatives/{creativeId}/stats
```

## Monitoring & Debugging

### Debug Mode

Enable debug logging with:
```bash
DEBUG_SNAPCHAT_OAUTH=true
SNAPCHAT_DEBUG_ALLOW=true
```

### Health Checks

- OAuth URL generation testing
- Token validity verification
- API connectivity checks

## Deployment Considerations

### Environment Setup

1. Register Snapchat app at https://developers.snapchat.com/
2. Configure OAuth redirect URIs
3. Set environment variables in deployment
4. Test OAuth flow before going live

### Production Checklist

- [ ] OAuth redirect URIs configured in Snapchat
- [ ] Environment variables set correctly
- [ ] HTTPS enabled for secure callbacks
- [ ] Error logging configured
- [ ] Rate limiting implemented

## Troubleshooting

### Common Issues

1. **500 Error on OAuth**: Check app approval status
2. **Invalid Redirect URI**: Verify URI in Snapchat app settings
3. **Token Expired**: Implement refresh token logic
4. **State Mismatch**: Check Firestore connectivity

### Debug Steps

1. Enable debug mode and check logs
2. Test debug endpoints for OAuth URL validation
3. Verify environment variables
4. Check Firestore connectivity
5. Validate Snapchat app configuration

## Future Enhancements

- Automated content scheduling
- Advanced analytics dashboard
- Multi-account management
- Creative optimization
- A/B testing for ad performance
