const fs = require('fs');
const path = require('path');

// Original validation middleware (keeping for reference)
try {
  const { validateContentData, sanitizeInput } = require('./validationMiddleware');

  // Function to test content validation
  function testContentValidation() {
    console.log('==== Content Validation Test ====');
    
    // Mock request and response objects
    const mockReq = {
      body: {
        title: 'Test Video',
        type: 'video',
        url: 'https://example.com/test.mp4',
        description: 'Test description'
      }
    };

    const mockRes = {
      status: (code) => ({
        json: (data) => {
          console.log(`Response ${code}:`, JSON.stringify(data, null, 2));
          return mockRes;
        }
      })
    };

    const mockNext = () => {
      console.log('Validation passed! Proceeding to next middleware.');
    };

    // Test the validation
    console.log('Testing validation with payload:', JSON.stringify(mockReq.body, null, 2));
    console.log('');

    // First sanitize
    sanitizeInput(mockReq, mockRes, () => {
      console.log('After sanitization:', JSON.stringify(mockReq.body, null, 2));
      console.log('');

      // Then validate
      validateContentData(mockReq, mockRes, mockNext);
    });
  }
} catch (error) {
  console.log('Validation middleware not available or has errors:', error.message);
}

// Check if Firebase Admin SDK is installed
function checkFirebaseAdmin() {
  try {
    require('firebase-admin');
    console.log('✅ firebase-admin package is installed');
    return true;
  } catch (error) {
    console.error('❌ firebase-admin package is not installed');
    console.error('   Run: npm install firebase-admin');
    return false;
  }
}

// Check for service account key file
function checkServiceAccountKey() {
  const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
  
  if (fs.existsSync(serviceAccountPath)) {
    console.log('✅ serviceAccountKey.json exists');
    try {
      const serviceAccount = require(serviceAccountPath);
      if (serviceAccount.project_id && serviceAccount.private_key) {
        console.log('✅ serviceAccountKey.json appears to be valid');
      } else {
        console.log('❌ serviceAccountKey.json exists but may be incomplete');
      }
    } catch (error) {
      console.error('❌ serviceAccountKey.json exists but is not valid JSON');
    }
    return true;
  } else {
    console.error('❌ serviceAccountKey.json is missing');
    console.error('   This file is required for Firebase Admin SDK authentication');
    return false;
  }
}

// Check if test scripts exist
function checkTestScripts() {
  const scripts = [
    'checkDatabaseConnection.js',
    'testAdminQueries.js',
    'generateSampleData.js'
  ];
  
  let allExist = true;
  
  for (const script of scripts) {
    const scriptPath = path.join(__dirname, script);
    if (fs.existsSync(scriptPath)) {
      console.log(`✅ ${script} exists`);
    } else {
      console.error(`❌ ${script} is missing`);
      allExist = false;
    }
  }
  
  return allExist;
}

// Create test-results directory if it doesn't exist
function createResultsDir() {
  const resultsDir = path.join(__dirname, 'test-results');
  
  if (!fs.existsSync(resultsDir)) {
    try {
      fs.mkdirSync(resultsDir);
      console.log('✅ Created test-results directory');
      return true;
    } catch (error) {
      console.error('❌ Failed to create test-results directory');
      console.error('   Error:', error.message);
      return false;
    }
  } else {
    console.log('✅ test-results directory already exists');
    return true;
  }
}

// Main validation function
function validateTestEnvironment() {
  console.log('======================================');
  console.log('AutoPromote Test Environment Validation');
  console.log('======================================');
  console.log();
  
  const adminSdkInstalled = checkFirebaseAdmin();
  const serviceAccountExists = checkServiceAccountKey();
  const scriptsExist = checkTestScripts();
  const resultsDirCreated = createResultsDir();
  
  console.log();
  console.log('======================================');
  console.log('Validation Summary:');
  
  if (adminSdkInstalled && serviceAccountExists && scriptsExist && resultsDirCreated) {
    console.log('✅ All checks passed! You can run the tests with:');
    console.log('   PowerShell: .\\Run-IntegrationTests.ps1');
    console.log('   CMD: .\\run-integration-tests.bat');
    process.exit(0);
  } else {
    console.log('❌ Some checks failed. Please address the issues above before running tests.');
    process.exit(1);
  }
}

// Run the validation
validateTestEnvironment();
