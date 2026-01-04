# CodeQL Security Fixes TODO

## High Priority Security Fixes

### 1. Rate Limiting Issues

- [ ] Add rate limiting to `tiktokRoutes.js` auth routes (alerts 372, 371, 365, 364, 363, 362, 361, 360, 359, 358)
- [ ] Add rate limiting to `src/server.js` routes (alerts 364, 363)
- [ ] Add rate limiting to `src/routes/viralGrowthRoutes.js` (alert 362, 361)
- [ ] Add rate limiting to `src/routes/repostRoutes.js` (alert 360)
- [ ] Add rate limiting to `src/routes/platformRoutes.js` (alert 359)
- [ ] Add rate limiting to `src/routes/paypalWebhookRoutes.js` (alert 358)

### 2. Biased Cryptographic Random Numbers

- [ ] Fix biased random in `src/services/viralImpactEngine.js` line 417 (alert 369)
- [ ] Fix biased random in `src/routes/viralGrowthRoutes.js` lines 214-216 (alerts 368, 367, 366)

### 3. Insecure Helmet Configuration

- [ ] Enable CSP in `src/server.js` (alerts 370, 357, 356)

### 4. Server-Side Request Forgery (SSRF)

- [ ] Fix SSRF in `tiktokRoutes.js` line 530 (alert 355)
- [ ] Fix SSRF in `src/snapchatRoutes.js` line 319 (alert 354)
- [ ] Fix SSRF in `src/services/youtubeService.js` line 77 (alert 353)
- [ ] Fix SSRF in `src/routes/paypalWebhookRoutes.js` lines 68, 135 (alerts 352, 351)
- [ ] Fix SSRF in `src/routes/aggregateStatusRoutes.js` line 22 (alert 350)

### 5. Tainted Format Strings

- [ ] Fix tainted format string in `src/services/repostDrivenEngine.js` lines 136, 139 (alerts 349, 348)

### 6. Permissive CORS Configuration

- [ ] Restrict CORS origins in `backend/server.js` (alert 347)

### 7. Prototype-Polluting Assignments

- [ ] Fix prototype pollution in `src/routes/variantAdminRoutes.js` line 16 (alert 346)

### 8. Incomplete String Sanitization

- [ ] Fix incomplete sanitization in multiple JS files (alerts 345, 344, 343, 342, 341)

### 9. Path Injection Vulnerabilities

- [ ] Fix path injection in `src/server.js` lines 730, 731 (alerts 340, 339)
- [ ] Fix path injection in `src/contentQualityCheck.js` lines 13, 27 (alerts 338, 337)
- [ ] Fix path injection in `contentQualityCheck.js` lines 16, 59, 74, 89 (alerts 336, 335, 334, 333)
- [ ] Fix path injection in `backend/contentQualityCheck.js` lines 59, 68, 80 (alerts 332, 331, 330)

## Implementation Plan

1. Start with rate limiting fixes - add middleware to unprotected routes
2. Fix cryptographic random number generation - replace modulo operations
3. Enable CSP in Helmet configuration
4. Implement URL validation for SSRF prevention
5. Fix string formatting issues
6. Restrict CORS configuration
7. Prevent prototype pollution
8. Add proper string escaping
9. Implement path validation

## Testing

- [ ] Run CodeQL analysis after each major fix
- [ ] Verify application still functions correctly
- [ ] Test rate limiting works as expected
- [ ] Test OAuth flows still work
- [ ] Test file upload/download functionality
