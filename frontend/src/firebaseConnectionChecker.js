// Firebase Connection Checker
// This script verifies the connection to Firebase services
// and provides diagnostic information

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, collection, getDocs, limit, query } from 'firebase/firestore';
import { getStorage, ref, listAll } from 'firebase/storage';

// Use the same config as in firebaseClient.js
const firebaseConfig = {
  apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
  authDomain: "autopromote-464de.firebaseapp.com",
  projectId: "autopromote-464de",
  storageBucket: "autopromote-464de.appspot.com",
  messagingSenderId: "317746682241",
  appId: "1:317746682241:web:f363e099d55ffd1af1b080",
  measurementId: "G-8QDQXF0FPQ"
};

// Initialize Firebase
console.log('Initializing Firebase with configuration...');
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Run all checks and display results
async function runConnectionChecks() {
  console.log('=================================================');
  console.log('  FIREBASE CONNECTION HEALTH CHECK');
  console.log('=================================================');
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('\n');

  let allChecksPassed = true;
  
  // Check 1: Authentication
  console.log('1. Testing Firebase Authentication connection...');
  try {
    const anonymousAuth = await signInAnonymously(auth);
    console.log('   ✅ Authentication working! Anonymous auth successful.');
    console.log(`   User ID: ${anonymousAuth.user.uid}`);
  } catch (error) {
    console.error('   ❌ Authentication failed:', error.message);
    console.error(`   Error code: ${error.code}`);
    allChecksPassed = false;
  }
  
  // Check 2: Firestore
  console.log('\n2. Testing Firestore database connection...');
  try {
    // Try to fetch users collection (limit to 1 doc)
    const usersQuery = query(collection(db, 'users'), limit(1));
    const usersSnapshot = await getDocs(usersQuery);
    
    if (!usersSnapshot.empty) {
      console.log('   ✅ Firestore connection working! Successfully fetched user data.');
      console.log(`   Retrieved ${usersSnapshot.size} user(s)`);
    } else {
      console.log('   ✅ Firestore connection working, but no users found in the collection.');
    }
    
    // Check what collections are available
    console.log('   Checking available collections...');
    const collections = ['users', 'content', 'promotions', 'analytics'];
    for (const collName of collections) {
      try {
        const collQuery = query(collection(db, collName), limit(1));
        const snapshot = await getDocs(collQuery);
        console.log(`   - Collection '${collName}': ${snapshot.empty ? 'Empty' : `Contains data (${snapshot.size} documents)`}`);
      } catch (e) {
        console.log(`   - Collection '${collName}': Error accessing - ${e.message}`);
      }
    }
    
  } catch (error) {
    console.error('   ❌ Firestore connection failed:', error.message);
    console.error(`   Error code: ${error.code}`);
    allChecksPassed = false;
  }
  
  // Check 3: Storage
  console.log('\n3. Testing Firebase Storage connection...');
  try {
    const storageRef = ref(storage);
    const result = await listAll(storageRef);
    
    console.log('   ✅ Storage connection working!');
    console.log(`   Found ${result.items.length} files and ${result.prefixes.length} folders at root level`);
    
    if (result.prefixes.length > 0) {
      console.log('   Storage folders found:');
      result.prefixes.forEach(folderRef => {
        console.log(`   - ${folderRef.fullPath}`);
      });
    }
    
  } catch (error) {
    console.error('   ❌ Storage connection failed:', error.message);
    console.error(`   Error code: ${error.code}`);
    allChecksPassed = false;
  }
  
  // Final verdict
  console.log('\n=================================================');
  if (allChecksPassed) {
    console.log('✅ ALL CHECKS PASSED - Firebase connection is healthy!');
  } else {
    console.log('❌ SOME CHECKS FAILED - Please review the issues above.');
  }
  console.log('=================================================');
}

// Run the checks
runConnectionChecks();

export default runConnectionChecks;
