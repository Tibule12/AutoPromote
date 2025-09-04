// checkDatabaseConnection.js
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin if not already initialized
try {
  if (!admin.apps.length) {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error('Firebase initialization error:', error);
  process.exit(1);
}

const db = admin.firestore();

// Helper to write results to file
function writeResultsToFile(results) {
  const filePath = path.join(__dirname, 'database-check-results.json');
  fs.writeFileSync(filePath, JSON.stringify(results, null, 2));
  console.log(`Results written to ${filePath}`);
}

// Test database connection
async function testConnection() {
  console.log('Testing Firestore connection...');
  try {
    await db.collection('_test_connection').doc('test').set({
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('_test_connection').doc('test').delete();
    console.log('✅ Connection test passed!');
    return true;
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    return false;
  }
}

// Check if collections exist
async function checkCollections() {
  const requiredCollections = ['users', 'content', 'promotions', 'activities', 'analytics'];
  const results = { existing: [], missing: [] };
  
  console.log('Checking collections...');
  
  try {
    const collections = await db.listCollections();
    const collectionIds = collections.map(col => col.id);
    
    for (const collection of requiredCollections) {
      if (collectionIds.includes(collection)) {
        results.existing.push(collection);
        console.log(`✅ Collection '${collection}' exists`);
      } else {
        results.missing.push(collection);
        console.log(`❌ Collection '${collection}' is missing`);
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error checking collections:', error);
    return { error: error.message };
  }
}

// Check if admin dashboard queries work
async function testAdminQueries() {
  const results = { passed: [], failed: [] };
  
  console.log('Testing admin dashboard queries...');
  
  const queries = [
    {
      name: 'Recent users',
      execute: () => db.collection('users')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get()
    },
    {
      name: 'Content metrics',
      execute: () => db.collection('content')
        .orderBy('views', 'desc')
        .limit(5)
        .get()
    },
    {
      name: 'Recent activities',
      execute: () => db.collection('activities')
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get()
    },
    {
      name: 'Active promotions',
      execute: () => db.collection('promotions')
        .where('status', '==', 'active')
        .get()
    },
    {
      name: 'Analytics summary',
      execute: () => db.collection('analytics')
        .doc('summary')
        .get()
    }
  ];
  
  for (const query of queries) {
    try {
      console.log(`Testing query: ${query.name}...`);
      const snapshot = await query.execute();
      results.passed.push({
        name: query.name,
        count: snapshot.size || (snapshot.exists ? 1 : 0)
      });
      console.log(`✅ Query '${query.name}' executed successfully`);
    } catch (error) {
      results.failed.push({
        name: query.name,
        error: error.message
      });
      console.log(`❌ Query '${query.name}' failed: ${error.message}`);
    }
  }
  
  return results;
}

// Main function to run all tests
async function runTests() {
  console.log('=== DATABASE CONNECTION CHECK ===');
  
  const results = {
    timestamp: new Date().toISOString(),
    connection: false,
    collections: null,
    queries: null
  };
  
  // Test 1: Connection
  results.connection = await testConnection();
  
  if (results.connection) {
    // Test 2: Collections
    results.collections = await checkCollections();
    
    // Test 3: Queries
    results.queries = await testAdminQueries();
  }
  
  // Print summary
  console.log('\n=== TEST SUMMARY ===');
  console.log(`Connection: ${results.connection ? '✅ PASSED' : '❌ FAILED'}`);
  
  if (results.collections) {
    console.log(`Collections: ${results.collections.missing.length === 0 ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Existing: ${results.collections.existing.length}`);
    console.log(`  Missing: ${results.collections.missing.length}`);
  }
  
  if (results.queries) {
    console.log(`Queries: ${results.queries.failed.length === 0 ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`  Passed: ${results.queries.passed.length}`);
    console.log(`  Failed: ${results.queries.failed.length}`);
  }
  
  // Write results to file
  writeResultsToFile(results);
  
  // Exit with appropriate code
  const success = results.connection && 
                 results.collections && results.collections.missing.length === 0 &&
                 results.queries && results.queries.failed.length === 0;
  
  process.exit(success ? 0 : 1);
}

// Run the tests
runTests().catch(error => {
  console.error('Unhandled error during tests:', error);
  process.exit(1);
});
