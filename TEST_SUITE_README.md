# AutoPromote Testing Suite

## Overview

This testing suite provides comprehensive tools for verifying the integration between the admin dashboard and the database in the AutoPromote application. The testing framework includes:

1. **Database Connection Check** - Verifies connectivity to Firestore
2. **Collection Verification** - Ensures required database collections exist
3. **Query Testing** - Validates that admin dashboard queries function correctly
4. **Sample Data Generation** - Creates test data for development and testing
5. **Browser-Based Testing** - Provides a UI for running tests in the browser

## Files Included

- `checkDatabaseConnection.js` - Node.js script to verify database connectivity
- `testAdminQueries.js` - Tests all queries used by the admin dashboard
- `generateSampleData.js` - Creates sample data for testing
- `TestConsole.js` and `TestConsole.css` - Browser-based testing interface
- `run-integration-tests.bat` - Windows batch file to run all tests
- `INTEGRATION_TESTING.md` - Documentation for integration testing
- `TESTING_GUIDE.md` - Comprehensive testing guide

## Running Tests

### Command Line Testing

1. Database Connection Check:
   ```
   node checkDatabaseConnection.js
   ```

2. Admin Queries Test:
   ```
   node testAdminQueries.js
   ```

3. Generate Sample Data:
   ```
   node generateSampleData.js
   ```

4. Run All Tests (Windows):
   ```
   run-integration-tests.bat
   ```

### Browser-Based Testing

1. Start the application:
   ```
   npm start
   ```

2. Log in as an admin user
3. Navigate to `/test-console` or click "Test Connection" in the admin dashboard
4. Use the test console to run various tests

## Test Results

- Command line tests write results to the `test-results` directory
- Browser-based tests display results directly in the UI
- Results include details about each test, success/failure status, and data retrieved

## Required Database Collections

The testing suite verifies the following collections:

1. `users` - User accounts and profiles
2. `content` - Content items managed by users
3. `promotions` - Promotion campaigns created for content
4. `activities` - User activity logs
5. `analytics` - Aggregated metrics and statistics

## Admin Dashboard Queries

The testing suite validates the following types of queries:

1. Recent user registrations
2. Admin user identification
3. Top-performing content
4. Active promotion campaigns
5. Recent user activities
6. Analytics metrics retrieval
7. User type distribution
8. Platform performance metrics

## Troubleshooting

If tests fail, check the following:

1. Firebase credentials in `serviceAccountKey.json`
2. Firestore security rules (should allow admin access)
3. Network connectivity to Firebase
4. Database structure and schema

## Next Steps

After verifying integration, you can:

1. Deploy the application to your hosting environment
2. Set up regular automated testing with CI/CD
3. Extend the test suite with additional test cases
4. Implement end-to-end testing with Cypress or similar tools
