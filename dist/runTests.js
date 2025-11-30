// runTests.js
// A Node.js script to test database and admin dashboard integration

// Use Firebase Admin SDK for backend integration tests
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
try {
  admin.app();
} catch (error) {
  // Prefer using explicitly provided env-based service account values instead of a tracked file.
  const fs = require('fs');
  const path = require('path');
  let sa;
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try { sa = require(path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)); } catch (e) { sa = null; }
  }
  if (!sa && (process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64)) {
    try {
      const tmpPath = path.resolve(__dirname, 'tmp', 'service-account.json');
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      const payload = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT || Buffer.from(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
      fs.writeFileSync(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      sa = JSON.parse(payload);
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
    } catch (e) {
      console.warn('⚠️ Could not materialize service account JSON for runTests:', e.message);
    }
  }
  if (!sa) {
    console.error('❌ No service account available as env. Please set FIREBASE_ADMIN_SERVICE_ACCOUNT (JSON) or FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 (base64) or GOOGLE_APPLICATION_CREDENTIALS pointing to a service account file. Do NOT use a committed service account JSON.');
    process.exit(1);
  }
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    databaseURL: 'https://autopromote-cc6d3.firebaseio.com'
  });
}
const db = admin.firestore();

/**
 * Test connection to Firestore and verify collections
 */
async function testFirestoreConnection() {
  console.log('🔍 Testing Firestore connection (Admin SDK)...');
  try {
    // Test connection by trying to get a document from users collection
    const usersSnapshot = await db.collection('users').limit(1).get();
    console.log('✅ Firestore connection successful');
    console.log(`📊 Users collection ${usersSnapshot.empty ? 'is empty' : 'contains data'}`);
    return true;
  } catch (error) {
    console.error('❌ Firestore connection failed:', error);
    return false;
  }
}

/**
 * Test that all required collections exist for the admin dashboard
 */
async function testRequiredCollections() {
  console.log('🔍 Testing required collections for admin dashboard...');
  
  const requiredCollections = ['users', 'content', 'promotions', 'activities', 'analytics'];
  const results = {};
  
  for (const collectionName of requiredCollections) {
    try {
      const snapshot = await db.collection(collectionName).limit(1).get();
      results[collectionName] = {
        exists: true,
        hasData: !snapshot.empty
      };
      console.log(`✅ Collection '${collectionName}' exists and ${snapshot.empty ? 'is empty' : 'contains data'}`);
    } catch (error) {
      results[collectionName] = {
        exists: false,
        error: error.message
      };
      console.error(`❌ Error accessing collection '${collectionName}':`, error);
    }
  }
  
  return results;
}

/**
 * Test admin dashboard data queries
 */
async function testAdminDashboardQueries() {
  console.log('🔍 Testing admin dashboard queries...');
  
  try {
    // Test users query
    const usersSnapshot = await db.collection('users').get();
    console.log(`✅ Users query returned ${usersSnapshot.size} results`);
    
    // Test content query
    const contentSnapshot = await db.collection('content').get();
    console.log(`✅ Content query returned ${contentSnapshot.size} results`);
    
    // Test promotions query
    const promotionsSnapshot = await db.collection('promotions').get();
    console.log(`✅ Promotions query returned ${promotionsSnapshot.size} results`);
    
    // Test activities query
    const recentActivitiesSnapshot = await db.collection('activities').limit(10).get();
    console.log(`✅ Recent activities query returned ${recentActivitiesSnapshot.size} results`);
    
    return true;
  } catch (error) {
    console.error('❌ Admin dashboard queries failed:', error);
    return false;
  }
}

/**
 * Run all tests and log results
 */
async function runAllTests() {
  console.log('🚀 Starting integration tests...');
  
  const connectionResult = await testFirestoreConnection();
  if (!connectionResult) {
    console.error('❌ Cannot continue tests due to connection failure');
    return false;
  }
  
  const collectionsResult = await testRequiredCollections();
  const queriesResult = await testAdminDashboardQueries();
  
  console.log('\n📋 Test Results Summary:');
  console.log(`Firestore Connection: ${connectionResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Required Collections: ${Object.values(collectionsResult).every(r => r.exists) ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Dashboard Queries: ${queriesResult ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = connectionResult && 
                    Object.values(collectionsResult).every(r => r.exists) && 
                    queriesResult;
                    
  console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED!' : '❌ SOME TESTS FAILED'}`);
  
  return allPassed;
}

// Run the tests
runAllTests()
  .then(result => {
    console.log('Tests completed with result:', result);
    process.exit(result ? 0 : 1);
  })
  .catch(error => {
    console.error('Error running tests:', error);
    process.exit(1);
  });
