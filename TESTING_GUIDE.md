# AutoPromote Testing Guide

## Table of Contents
1. [Overview](#overview)
2. [Test Environment Setup](#test-environment-setup)
3. [Database Integration Testing](#database-integration-testing)
4. [Admin Dashboard Testing](#admin-dashboard-testing)
5. [Running Tests](#running-tests)
6. [Test Automation](#test-automation)
7. [Troubleshooting](#troubleshooting)

## Overview

This guide provides comprehensive instructions for testing the AutoPromote application, with a focus on database integration and admin dashboard functionality. The testing approach includes both manual and automated methods to ensure the application is fully functional.

## Test Environment Setup

### Prerequisites

Before running tests, ensure you have the following:

1. Node.js (v14 or later)
2. Firebase project set up with Firestore
3. Service account key saved as `serviceAccountKey.json` in the project root
4. All npm dependencies installed

### Environment Configuration

1. Verify that your `.env` file contains the necessary Firebase configuration:

```
REACT_APP_FIREBASE_API_KEY=your_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_storage_bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

2. For running backend tests, ensure that service account credentials are properly configured.

### Sample Data Generation

To test with sample data:

```powershell
node generateSampleData.js
```

This script will:
- Create 20 sample users (including 2 admin users)
- Generate 30 content items
- Create 25 promotions
- Add 50 activity logs
- Generate an analytics summary with 30 days of data

## Database Integration Testing

### Automated Testing

The application includes a database connection checking utility:

```powershell
node checkDatabaseConnection.js
```

This script checks:
1. Connection to Firestore
2. Existence of required collections
3. Functionality of admin dashboard queries

### Browser-Based Testing

You can also test database integration through the browser:

1. Login as an admin user
2. Navigate to `/test-console` or click the "Test Connection" button in the admin dashboard
3. Use the Test Console UI to run various database tests

## Admin Dashboard Testing

### Component Testing

Test each component of the admin dashboard:

1. **Overview Section**
   - Verify that key metrics are displayed
   - Check that charts load with data
   - Verify period selector functionality

2. **User Management**
   - Test user filtering and sorting
   - Verify user details display
   - Test admin user creation (if applicable)

3. **Content Analysis**
   - Verify content metrics are accurate
   - Test content filtering and sorting
   - Check content performance data

4. **Promotion Management**
   - Test promotion status filters
   - Verify promotion metrics
   - Check scheduling functionality

5. **Activity Feed**
   - Verify recent activities are displayed
   - Test activity filtering
   - Check timestamp display

### Integration Points

Test integration between different parts of the admin dashboard:

1. User ↔ Content relationship
2. Content ↔ Promotions relationship
3. All activities related to users, content, and promotions

## Running Tests

### Command Line Testing

Run the following command to test database integration:

```powershell
node checkDatabaseConnection.js
```

The test results will be saved to `database-check-results.json`.

### Browser Testing

1. Start the development server:

```powershell
npm start
```

2. Login with admin credentials
3. Navigate to `/test-console`
4. Click "Run All Tests" to perform browser-based testing

### Visual Testing

Perform visual inspection of the admin dashboard:

1. Verify that all sections load correctly
2. Check responsive design at different screen sizes
3. Verify that all data is displayed correctly
4. Test interactive elements (tabs, buttons, filters)

## Test Automation

### Setting Up Automated Tests

You can set up automated testing using CI/CD:

1. **GitHub Actions**: Add a workflow file to run tests on push or pull request
2. **Scheduled Tests**: Set up scheduled test runs to verify ongoing functionality

Example GitHub Actions workflow:

```yaml
name: Database Integration Tests

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
  schedule:
    - cron: '0 0 * * 1' # Run weekly on Mondays

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    - name: Use Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '14'
    - run: npm ci
    - name: Run database connection tests
      run: node checkDatabaseConnection.js
      env:
        FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
```

## Troubleshooting

### Common Issues

1. **Firebase Connection Issues**
   - Verify that your Firebase project is correctly set up
   - Check that service account key has proper permissions
   - Ensure Firestore is enabled in your Firebase project

2. **Missing Collections**
   - Run `generateSampleData.js` to create missing collections
   - Check Firestore security rules to ensure proper access

3. **Authentication Issues**
   - Verify admin user credentials
   - Check Firebase Authentication settings
   - Ensure custom claims are properly set for admin users

4. **Data Not Displaying**
   - Check browser console for errors
   - Verify that queries are constructed correctly
   - Ensure data exists in the database

### Logs and Diagnostics

For detailed diagnostics:

1. Run the connection check with verbose logging:

```powershell
$env:DEBUG="true"; node checkDatabaseConnection.js
```

2. Check Firebase Authentication logs in the Firebase Console
3. Review browser console logs when using the admin dashboard

### Getting Help

If you encounter persistent issues:

1. Check the Firebase documentation
2. Review the AutoPromote codebase for recent changes
3. Contact the development team with specific error messages

---

*This testing guide was last updated on June 2023 and applies to the current version of AutoPromote.*
