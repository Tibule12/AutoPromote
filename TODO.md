# Security Vulnerabilities Fix Plan

## Identified Issues from CodeQL Scan
1. **Insecure Randomness**: Using Math.random() for OAuth nonces/states instead of cryptographically secure random
2. **Server-Side Request Forgery (SSRF)**: Video upload endpoint fetches user-provided URLs without validation
3. **Missing Rate Limiting**: Several endpoints lack rate limiting protection
4. **Reflected XSS**: HTML responses embed user-influenced data without proper escaping
5. **Incomplete String Escaping**: URL parameters in HTML not properly escaped

## Files to Modify
- `tiktokRoutes.js`: Fix insecure randomness, add URL validation for SSRF, add rate limiting, fix HTML escaping
- `src/middlewares/simpleRateLimit.js`: Ensure it's applied to vulnerable endpoints

## Implementation Steps
1. Replace Math.random() with crypto.randomBytes() for OAuth state/nonce generation
2. Add URL validation middleware to prevent SSRF in video upload
3. Apply rate limiting to /upload, /analytics, and /callback endpoints
4. Properly escape HTML output in OAuth flow responses
5. Add input validation for all user-provided URLs and parameters

## Testing
- Verify OAuth flow still works with secure random generation
- Test video upload with various URL types (reject internal URLs)
- Confirm rate limiting works on protected endpoints
- Check HTML responses don't contain XSS vectors
