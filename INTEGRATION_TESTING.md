# Integration Testing Guide

## Overview

This document provides instructions on how to test the integration between the database and the admin dashboard in the AutoPromote application.

## Testing Methods

There are three ways to test the integration:

1. **Browser-Based Testing**: Using the Integration Tester UI
2. **Command-Line Testing**: Using the Node.js test script
3. **Visual Verification**: Checking the admin dashboard manually

## Browser-Based Testing

1. **Login as Admin**: First, log in with an admin account
2. **Access Test UI**: Click the "Run Tests" button in the header or navigate to `/integration-test`
3. **Run Tests**: Click "Run All Tests" or run individual tests
4. **Check Results**: Test results will be displayed on the page

The Integration Tester UI provides the following tests:

- **Connection Test**: Verifies connection to Firestore
- **Collections Test**: Checks that all required collections exist
- **Sync Test**: Tests the DatabaseSyncService functionality
- **Queries Test**: Verifies that admin dashboard queries work properly

## Command-Line Testing

Run the test script from the project root:

```bash
npm run test:integration
```

This script will:

1. Connect to Firestore
2. Check all required collections
3. Test all admin dashboard queries
4. Display a summary of results

If any test fails, the script will exit with a non-zero code, making it suitable for CI/CD pipelines.

## Visual Verification

To visually verify that everything is working:

1. **Login as Admin**: Access the application with admin credentials
2. **Check Dashboard**: Verify that the admin dashboard loads properly
3. **Check Data**: Confirm that all sections of the dashboard display data
4. **Check Interactions**: Test tab navigation and data refresh functionality

### Visual Testing Checklist

- [ ] Dashboard header shows admin name
- [ ] Overview tab displays key metrics (users, content, revenue)
- [ ] User Analytics tab shows user segmentation data
- [ ] Content Performance tab displays content metrics
- [ ] Revenue & Finance tab shows financial data
- [ ] Recent activity feed displays activities
- [ ] Data refresh button works correctly
- [ ] All charts and tables render properly

## Troubleshooting

If you encounter issues during testing:

1. **Check Console**: Look for errors in the browser console
2. **Verify Firebase Config**: Make sure your Firebase configuration is correct
3. **Check Security Rules**: Ensure Firestore security rules allow admin access
4. **Clear Cache**: Try clearing browser cache and refreshing

## Automatic Database Setup

The application includes automatic database setup functionality:

- The `DatabaseSync` component runs on application startup
- It checks for all required collections and creates them if missing
- Sample data is generated for testing and development

This means even with a fresh database, the admin dashboard should function properly after the initial sync completes.

## Expected Results

A successful integration test should show:

1. Connection to Firestore is established
2. All required collections exist (`users`, `content`, `promotions`, `activities`, `analytics`)
3. Dashboard queries return expected data
4. Admin dashboard renders without errors

If all tests pass, the database and admin dashboard are fully integrated and functional.
