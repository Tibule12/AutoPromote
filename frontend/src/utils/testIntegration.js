// testIntegration.js
// This script tests the integration between the database and admin dashboard

import { db } from '../firebaseClient';
import { collection, getDocs, query, limit, where, Timestamp } from 'firebase/firestore';
import DatabaseSyncService from './dbSchemaSync';

/**
 * Test connection to Firestore and verify collections
 */
async function testFirestoreConnection() {
  console.log('🔍 Testing Firestore connection...');
  
  try {
    // Test connection by trying to get a document from users collection
    const usersSnapshot = await getDocs(query(collection(db, 'users'), limit(1)));
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
      const snapshot = await getDocs(query(collection(db, collectionName), limit(1)));
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
 * Test that the DatabaseSyncService can create sample data
 */
async function testDatabaseSync() {
  console.log('🔍 Testing database sync service...');
  
  try {
    const result = await DatabaseSyncService.validateDatabaseSchema();
    console.log(`✅ Database sync completed with result: ${result}`);
    return result;
  } catch (error) {
    console.error('❌ Database sync failed:', error);
    return false;
  }
}

/**
 * Test admin dashboard data queries
 */
async function testAdminDashboardQueries() {
  console.log('🔍 Testing admin dashboard queries...');
  
  try {
    // Get current date for today's metrics
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = Timestamp.fromDate(today);
    
    // Test users query
    const usersSnapshot = await getDocs(collection(db, 'users'));
    console.log(`✅ Users query returned ${usersSnapshot.size} results`);
    
    // Test new users today query
    const newUsersQuery = query(
      collection(db, 'users'), 
      where('createdAt', '>=', todayTimestamp)
    );
    const newUsersSnapshot = await getDocs(newUsersQuery);
    console.log(`✅ New users today query returned ${newUsersSnapshot.size} results`);
    
    // Test content query
    const contentSnapshot = await getDocs(collection(db, 'content'));
    console.log(`✅ Content query returned ${contentSnapshot.size} results`);
    
    // Test promotions query
    const promotionsSnapshot = await getDocs(collection(db, 'promotions'));
    console.log(`✅ Promotions query returned ${promotionsSnapshot.size} results`);
    
    // Test activities query
    const recentActivitiesQuery = query(
      collection(db, 'activities'),
      limit(10)
    );
    const recentActivitiesSnapshot = await getDocs(recentActivitiesQuery);
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
  const syncResult = await testDatabaseSync();
  const queriesResult = await testAdminDashboardQueries();
  
  console.log('\n📋 Test Results Summary:');
  console.log(`Firestore Connection: ${connectionResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Required Collections: ${Object.values(collectionsResult).every(r => r.exists) ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Database Sync: ${syncResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Dashboard Queries: ${queriesResult ? '✅ PASS' : '❌ FAIL'}`);
  
  const allPassed = connectionResult && 
                    Object.values(collectionsResult).every(r => r.exists) && 
                    syncResult && 
                    queriesResult;
                    
  console.log(`\n${allPassed ? '🎉 ALL TESTS PASSED!' : '❌ SOME TESTS FAILED'}`);
  
  return allPassed;
}

// Export for use in browser or Node.js environment
export { 
  testFirestoreConnection,
  testRequiredCollections,
  testDatabaseSync,
  testAdminDashboardQueries,
  runAllTests
};

// Auto-run if in Node.js environment
if (typeof window === 'undefined') {
  runAllTests();
}
