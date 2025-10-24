AutoPromote integrates with Snapchat's Marketing API to enable cross-platform content distribution.

## How It Works

1. **OAuth Flow**: Users connect their Snapchat accounts through secure OAuth 2.0 authentication
2. **Token Management**: Access tokens are securely stored and automatically refreshed
3. **Content Posting**: Users can create and manage Snapchat ad creatives through our dashboard
4. **Analytics**: Performance metrics are fetched and displayed for campaign optimization

## Technical Implementation

- **Frontend**: React-based OAuth popup handling with postMessage communication
- **Backend**: Node.js/Express API endpoints for OAuth flow and Snapchat API integration
- **Security**: CSRF protection, token encryption, HTTPS-only communication
- **Storage**: Firebase Firestore for secure token and user data management

## Changes in This Version

This version adds complete Snapchat Marketing API integration including:
- OAuth authentication flow
- Token exchange and secure storage
- Creative creation endpoints
- Analytics data retrieval
- Comprehensive error handling and security measures

The integration follows OAuth 2.0 standards and Snapchat's API guidelines, ensuring secure and compliant access to Snapchat's advertising platform.
