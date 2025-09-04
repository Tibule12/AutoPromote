/**
 * Firebase Diagnostics and Connection Tester
 * 
 * This script provides a more comprehensive test of Firebase services
 * and helps diagnose issues with Firebase Admin SDK initialization.
 * 
 * It includes diagnostics for:
 * 1. Environment variable validation
 * 2. Firebase Admin SDK initialization
 * 3. Service account credential validation
 * 4. Clock synchronization check
 * 5. Firebase services connectivity tests
 */

require('dotenv').config();
const admin = require('firebase-admin');
const https = require('https');
const fs = require('fs');

// ANSI color codes for better output formatting
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

console.log(`${colors.cyan}===========================================`);
console.log(`   FIREBASE CONNECTION DIAGNOSTIC TOOL`);
console.log(`==========================================${colors.reset}`);

// Step 1: Environment variable validation
console.log(`\n${colors.magenta}STEP 1: ENVIRONMENT VARIABLE VALIDATION${colors.reset}`);

let serviceAccount = null;
let useServiceAccountJson = false;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.log(`${colors.green}✓${colors.reset} FIREBASE_SERVICE_ACCOUNT is set`);
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    useServiceAccountJson = true;
    
    // Validate required fields in service account
    const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !serviceAccount[field]);
    
    if (missingFields.length > 0) {
      console.log(`${colors.red}✗${colors.reset} Service account JSON is missing required fields: ${missingFields.join(', ')}`);
      useServiceAccountJson = false;
    } else {
      console.log(`${colors.green}✓${colors.reset} Service account JSON has all required fields`);
      console.log(`${colors.blue}ℹ${colors.reset} Project ID: ${serviceAccount.project_id}`);
      console.log(`${colors.blue}ℹ${colors.reset} Client Email: ${serviceAccount.client_email}`);
    }
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} Failed to parse FIREBASE_SERVICE_ACCOUNT as JSON: ${error.message}`);
    useServiceAccountJson = false;
  }
} else {
  console.log(`${colors.yellow}⚠${colors.reset} FIREBASE_SERVICE_ACCOUNT is not set, checking for individual credentials`);
}

// Check individual credential fields
if (!useServiceAccountJson) {
  const credFields = {
    'FIREBASE_PROJECT_ID': process.env.FIREBASE_PROJECT_ID,
    'FIREBASE_CLIENT_EMAIL': process.env.FIREBASE_CLIENT_EMAIL,
    'FIREBASE_PRIVATE_KEY': process.env.FIREBASE_PRIVATE_KEY
  };
  
  let missingCredFields = [];
  
  for (const [name, value] of Object.entries(credFields)) {
    if (!value) {
      console.log(`${colors.red}✗${colors.reset} ${name} is not set`);
      missingCredFields.push(name);
    } else {
      console.log(`${colors.green}✓${colors.reset} ${name} is set`);
      if (name === 'FIREBASE_PROJECT_ID') {
        console.log(`${colors.blue}ℹ${colors.reset} Project ID: ${value}`);
      } else if (name === 'FIREBASE_CLIENT_EMAIL') {
        console.log(`${colors.blue}ℹ${colors.reset} Client Email: ${value}`);
      }
    }
  }
  
  if (missingCredFields.length > 0) {
    console.log(`${colors.red}✗${colors.reset} Missing required Firebase credential fields: ${missingCredFields.join(', ')}`);
  } else {
    // Create service account object from individual fields
    serviceAccount = {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }
}

// Step 2: Clock synchronization check
console.log(`\n${colors.magenta}STEP 2: CLOCK SYNCHRONIZATION CHECK${colors.reset}`);

// Get the current server time
const serverTime = new Date();
console.log(`${colors.blue}ℹ${colors.reset} Server time: ${serverTime.toISOString()}`);

// Get the current time from a trusted NTP-like source (using time.gov API)
function checkTimeSync() {
  return new Promise((resolve) => {
    // Use Google's servers to check time
    https.get('https://www.google.com', (res) => {
      const remoteDate = new Date(res.headers.date);
      const timeDiff = Math.abs(serverTime - remoteDate);
      
      console.log(`${colors.blue}ℹ${colors.reset} Remote time: ${remoteDate.toISOString()}`);
      console.log(`${colors.blue}ℹ${colors.reset} Time difference: ${timeDiff} ms`);
      
      if (timeDiff > 150000) { // 150 seconds - Firebase typically allows 5 minute clock skew
        console.log(`${colors.red}✗${colors.reset} Server clock is significantly out of sync (${Math.round(timeDiff/1000)} seconds difference)`);
        console.log(`${colors.yellow}⚠${colors.reset} This may cause JWT verification to fail. Please synchronize your server clock.`);
      } else if (timeDiff > 30000) { // 30 seconds
        console.log(`${colors.yellow}⚠${colors.reset} Server clock is slightly out of sync (${Math.round(timeDiff/1000)} seconds difference)`);
        console.log(`${colors.blue}ℹ${colors.reset} This should be within Firebase's 5-minute tolerance for JWT verification, but synchronizing is recommended.`);
      } else {
        console.log(`${colors.green}✓${colors.reset} Server clock is properly synchronized`);
      }
      
      resolve();
    }).on('error', (err) => {
      console.log(`${colors.yellow}⚠${colors.reset} Could not check time synchronization: ${err.message}`);
      resolve();
    });
  });
}

// Step 3: Firebase Admin SDK initialization
async function initializeFirebase() {
  console.log(`\n${colors.magenta}STEP 3: FIREBASE ADMIN SDK INITIALIZATION${colors.reset}`);
  
  // Check if Firebase Admin SDK is already initialized
  if (admin.apps.length > 0) {
    console.log(`${colors.yellow}⚠${colors.reset} Firebase Admin SDK is already initialized. Deleting all apps...`);
    await Promise.all(admin.apps.map(app => app.delete()));
  }
  
  try {
    // Initialize Firebase Admin SDK
    let app;
    
    if (useServiceAccountJson) {
      console.log(`${colors.blue}ℹ${colors.reset} Initializing with full service account JSON`);
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      console.log(`${colors.blue}ℹ${colors.reset} Initializing with individual credential fields`);
      app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId: serviceAccount.projectId,
          clientEmail: serviceAccount.clientEmail,
          privateKey: serviceAccount.privateKey
        })
      });
    }
    
    console.log(`${colors.green}✓${colors.reset} Firebase Admin SDK initialized successfully`);
    return app;
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} Firebase Admin SDK initialization failed:`);
    console.log(`${colors.red}${error.message}${colors.reset}`);
    
    // Provide specific guidance based on error message
    if (error.message.includes('invalid_grant')) {
      console.log(`\n${colors.yellow}CREDENTIAL ISSUE DETECTED${colors.reset}`);
      
      if (error.message.includes('Invalid JWT Signature')) {
        console.log(`${colors.yellow}⚠${colors.reset} Invalid JWT Signature error detected. This likely means:`);
        console.log('1. Your service account key has been revoked');
        console.log('2. Your private key is malformed or corrupted');
        console.log('\nRecommended actions:');
        console.log('1. Generate a new service account key in the Firebase Console');
        console.log('2. Update your environment variables with the new key');
        console.log('3. Make sure your private key is properly formatted with \\n for newlines');
      } else if (error.message.includes('not a valid service account')) {
        console.log(`${colors.yellow}⚠${colors.reset} Not a valid service account error. This likely means:`);
        console.log('1. The project ID, client email, or private key is incorrect');
        console.log('2. The service account may have been deleted');
        console.log('\nRecommended actions:');
        console.log('1. Check your environment variables for typos');
        console.log('2. Generate a new service account key in the Firebase Console');
      }
    }
    
    return null;
  }
}

// Step 4: Test Firebase services
async function testFirebaseServices(app) {
  if (!app) {
    console.log(`${colors.red}✗${colors.reset} Skipping service tests due to initialization failure`);
    return;
  }
  
  console.log(`\n${colors.magenta}STEP 4: FIREBASE SERVICES CONNECTIVITY TEST${colors.reset}`);
  
  // Test Authentication service
  console.log(`\n${colors.cyan}Testing Authentication Service${colors.reset}`);
  try {
    const auth = admin.auth();
    const listUsersResult = await auth.listUsers(1);
    console.log(`${colors.green}✓${colors.reset} Authentication service connected successfully`);
    console.log(`${colors.blue}ℹ${colors.reset} Found ${listUsersResult.users.length} user(s) in the project`);
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} Authentication service test failed: ${error.message}`);
  }
  
  // Test Firestore service
  console.log(`\n${colors.cyan}Testing Firestore Service${colors.reset}`);
  try {
    const db = admin.firestore();
    const testDocRef = db.collection('_diagnostics').doc('test');
    await testDocRef.set({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      test: 'Connection test'
    });
    console.log(`${colors.green}✓${colors.reset} Firestore write operation successful`);
    
    const docSnapshot = await testDocRef.get();
    console.log(`${colors.green}✓${colors.reset} Firestore read operation successful`);
    
    await testDocRef.delete();
    console.log(`${colors.green}✓${colors.reset} Firestore delete operation successful`);
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} Firestore service test failed: ${error.message}`);
    
    // Check if Firestore is not enabled
    if (error.message.includes('PERMISSION_DENIED') || error.message.includes('FAILED_PRECONDITION')) {
      console.log(`${colors.yellow}⚠${colors.reset} Firestore might not be enabled for this project.`);
      console.log('Please visit the Firebase Console and enable Firestore for this project.');
    }
  }
  
  // Test Storage service
  console.log(`\n${colors.cyan}Testing Storage Service${colors.reset}`);
  try {
    const storage = admin.storage();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID}.appspot.com`;
    console.log(`${colors.blue}ℹ${colors.reset} Using storage bucket: ${bucketName}`);
    const bucket = storage.bucket(bucketName);
    const [exists] = await bucket.exists();
    console.log(`${colors.green}✓${colors.reset} Storage service connected successfully`);
    console.log(`${colors.blue}ℹ${colors.reset} Default bucket ${exists ? 'exists' : 'does not exist'}`);
    
    if (exists) {
      // Create a test file
      const tempFilePath = './temp-test-file.txt';
      fs.writeFileSync(tempFilePath, 'Test file content for Firebase Storage');
      
      const fileName = `_diagnostics/test-file-${Date.now()}.txt`;
      await bucket.upload(tempFilePath, {
        destination: fileName
      });
      console.log(`${colors.green}✓${colors.reset} Storage upload operation successful`);
      
      // Clean up
      await bucket.file(fileName).delete();
      fs.unlinkSync(tempFilePath);
      console.log(`${colors.green}✓${colors.reset} Storage delete operation successful`);
    }
  } catch (error) {
    console.log(`${colors.red}✗${colors.reset} Storage service test failed: ${error.message}`);
    
    // Check if Storage is not enabled
    if (error.message.includes('PERMISSION_DENIED') || error.message.includes('does not exist')) {
      console.log(`${colors.yellow}⚠${colors.reset} Firebase Storage might not be enabled for this project.`);
      console.log('Please visit the Firebase Console and enable Storage for this project.');
    }
  }
}

// Step 5: Generate recommendations
function generateRecommendations() {
  console.log(`\n${colors.magenta}STEP 5: RECOMMENDATIONS${colors.reset}`);
  
  console.log(`\n${colors.cyan}Next Steps:${colors.reset}`);
  console.log('1. If any tests failed, review the specific error messages above');
  console.log('2. If you received "Invalid JWT Signature" errors, generate a new service account key');
  console.log('3. Update your environment variables with the new credentials');
  console.log('4. Restart your application after updating the credentials');
  
  console.log(`\n${colors.cyan}Generating a New Service Account Key:${colors.reset}`);
  console.log('1. Go to the Firebase Console: https://console.firebase.google.com/');
  console.log('2. Select your project');
  console.log('3. Click on the gear icon (Project Settings)');
  console.log('4. Navigate to the "Service accounts" tab');
  console.log('5. Click "Generate new private key"');
  console.log('6. Save the JSON file securely (NEVER commit to source control)');
  
  console.log(`\n${colors.cyan}Updating Your Environment Variables:${colors.reset}`);
  console.log('Option 1: Use the full service account JSON:');
  console.log('   FIREBASE_SERVICE_ACCOUNT=<entire JSON content as a string>');
  console.log('\nOption 2: Use individual fields:');
  console.log('   FIREBASE_PROJECT_ID=your-project-id');
  console.log('   FIREBASE_CLIENT_EMAIL=your-service-account-email');
  console.log('   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n"');
}

// Main execution
async function main() {
  await checkTimeSync();
  const app = await initializeFirebase();
  await testFirebaseServices(app);
  generateRecommendations();
  
  console.log(`\n${colors.cyan}===========================================`);
  console.log(`          DIAGNOSTIC TEST COMPLETE`);
  console.log(`==========================================${colors.reset}`);
  
  // Clean up
  if (app) {
    await app.delete();
  }
}

main().catch(console.error);
