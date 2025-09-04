// firebase-auth-fix.js
const admin = require('firebase-admin');
const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, connectAuthEmulator } = require('firebase/auth');
const fetch = require('node-fetch');

// Initialize Firebase Admin
let adminApp;
try {
  adminApp = admin.app();
  console.log('Firebase Admin already initialized');
} catch (error) {
  const serviceAccount = require('./serviceAccountKey.json');
  adminApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
  });
  console.log('Firebase Admin initialized with project:', serviceAccount.project_id);
}

// Firebase client config
const firebaseConfig = {
  apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
  authDomain: "autopromote-464de.firebaseapp.com",
  projectId: "autopromote-464de",
  storageBucket: "autopromote-464de.firebasestorage.app",
  messagingSenderId: "317746682241",
  appId: "1:317746682241:web:f363e099d55ffd1af1b080"
};

// Initialize Firebase client
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Step 1: Verify API key
async function verifyApiKey() {
  try {
    console.log('\nStep 1: Verifying API key...');
    const apiKey = firebaseConfig.apiKey;
    
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          continueUri: 'http://localhost',
          identifier: 'test@example.com',
        }),
      }
    );
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('✅ API Key is valid!');
      return true;
    } else {
      console.log('❌ API Key verification failed:', data.error.message);
      return false;
    }
  } catch (error) {
    console.error('Error verifying API key:', error);
    return false;
  }
}

// Step 2: Create a new test user
async function createTestUser() {
  try {
    console.log('\nStep 2: Creating a new test user...');
    
    // Generate a unique email based on timestamp
    const timestamp = new Date().getTime();
    const email = `test_${timestamp}@example.com`;
    const password = 'TestPassword123!';
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      console.log('✅ Test user created successfully!');
      console.log('Email:', email);
      console.log('Password:', password);
      console.log('UID:', userCredential.user.uid);
      
      return {
        success: true,
        email,
        password,
        uid: userCredential.user.uid
      };
    } catch (error) {
      console.log('❌ Error creating test user:', error.code, error.message);
      
      if (error.code === 'auth/email-already-in-use') {
        console.log('This is expected if the user already exists. Trying to sign in instead...');
        return {
          success: false,
          email,
          password,
          error: error.message
        };
      }
      
      return {
        success: false,
        email,
        password,
        error: error.message
      };
    }
  } catch (error) {
    console.error('Error in createTestUser:', error);
    return { success: false, error: error.message };
  }
}

// Step 3: Try to sign in with the new user
async function testSignIn(email, password) {
  try {
    console.log(`\nStep 3: Testing sign in with ${email}...`);
    
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('✅ Sign in successful!');
    console.log('User:', userCredential.user.email);
    console.log('UID:', userCredential.user.uid);
    
    return {
      success: true,
      uid: userCredential.user.uid
    };
  } catch (error) {
    console.log('❌ Sign in failed:', error.code, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Step 4: Create user with admin SDK as fallback
async function createUserWithAdminSDK() {
  try {
    console.log('\nStep 4: Creating user with Admin SDK...');
    
    // Generate a unique email based on timestamp
    const timestamp = new Date().getTime();
    const email = `admin_test_${timestamp}@example.com`;
    const password = 'AdminTest123!';
    
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      emailVerified: true,
      displayName: 'Admin Test User'
    });
    
    console.log('✅ User created with Admin SDK!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('UID:', userRecord.uid);
    
    // Set custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      admin: true,
      role: 'admin'
    });
    
    console.log('✅ Admin claims set for user');
    
    return {
      success: true,
      email,
      password,
      uid: userRecord.uid
    };
  } catch (error) {
    console.log('❌ Error creating user with Admin SDK:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Step 5: List users
async function listUsers() {
  try {
    console.log('\nStep 5: Listing users in Firebase...');
    
    const listUsersResult = await admin.auth().listUsers(10);
    
    console.log('✅ Successfully retrieved user list!');
    console.log(`Total users: ${listUsersResult.users.length}`);
    
    listUsersResult.users.forEach((userRecord, index) => {
      console.log(`User ${index + 1}:`);
      console.log(`  UID: ${userRecord.uid}`);
      console.log(`  Email: ${userRecord.email}`);
      console.log(`  Display Name: ${userRecord.displayName || 'N/A'}`);
      if (userRecord.customClaims && userRecord.customClaims.admin) {
        console.log('  Role: Admin');
      } else {
        console.log('  Role: User');
      }
      console.log('----------------------------');
    });
    
    return {
      success: true,
      users: listUsersResult.users.map(user => ({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        isAdmin: user.customClaims && user.customClaims.admin
      }))
    };
  } catch (error) {
    console.log('❌ Error listing users:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Step 6: Attempt to log in with known users
async function attemptKnownUserLogins() {
  console.log('\nStep 6: Attempting to log in with known users...');
  
  const users = [
    { email: 'admin123@gmail.com', password: 'Admin12345', type: 'Admin' },
    { email: 'test@example.com', password: 'Test123!', type: 'Test User' },
    { email: 'tmtshwelo21@gmail.com', password: 'Thulani1205@', type: 'Regular User' }
  ];
  
  for (const user of users) {
    try {
      console.log(`\nTrying ${user.type} login: ${user.email}`);
      const userCredential = await signInWithEmailAndPassword(auth, user.email, user.password);
      console.log(`✅ Login successful for ${user.email}!`);
      console.log('UID:', userCredential.user.uid);
    } catch (error) {
      console.log(`❌ Login failed for ${user.email}:`, error.code);
      console.log('Error details:', error.message);
      
      // Try to reset the password if user exists
      try {
        const userRecord = await admin.auth().getUserByEmail(user.email);
        console.log(`User ${user.email} exists! Updating password...`);
        
        await admin.auth().updateUser(userRecord.uid, {
          password: user.password,
          emailVerified: true
        });
        
        console.log(`✅ Password updated for ${user.email}`);
        
        // Try login again
        try {
          console.log(`Trying login again for ${user.email}...`);
          const userCredential = await signInWithEmailAndPassword(auth, user.email, user.password);
          console.log(`✅ Login successful after password reset for ${user.email}!`);
        } catch (loginError) {
          console.log(`❌ Login still failed for ${user.email} after password reset:`, loginError.code);
        }
        
      } catch (userError) {
        if (userError.code === 'auth/user-not-found') {
          console.log(`User ${user.email} doesn't exist in Firebase. Creating...`);
          
          // Create the user
          try {
            const userRecord = await admin.auth().createUser({
              email: user.email,
              password: user.password,
              emailVerified: true,
              displayName: user.type
            });
            
            console.log(`✅ Created user ${user.email} with UID: ${userRecord.uid}`);
            
            // Set admin claims if needed
            if (user.type.toLowerCase().includes('admin')) {
              await admin.auth().setCustomUserClaims(userRecord.uid, {
                admin: true,
                role: 'admin'
              });
              console.log(`✅ Set admin claims for ${user.email}`);
              
              // Add to admins collection
              await admin.firestore().collection('admins').doc(userRecord.uid).set({
                uid: userRecord.uid,
                email: user.email,
                name: user.type,
                role: 'admin',
                isAdmin: true,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
              });
              console.log(`✅ Added ${user.email} to admins collection`);
            }
            
            // Add to users collection
            await admin.firestore().collection('users').doc(userRecord.uid).set({
              uid: userRecord.uid,
              email: user.email,
              name: user.type,
              role: user.type.toLowerCase().includes('admin') ? 'admin' : 'user',
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ Added ${user.email} to users collection`);
            
            // Try login now
            try {
              console.log(`Trying login for newly created ${user.email}...`);
              const userCredential = await signInWithEmailAndPassword(auth, user.email, user.password);
              console.log(`✅ Login successful for newly created ${user.email}!`);
            } catch (finalLoginError) {
              console.log(`❌ Login still failed for newly created ${user.email}:`, finalLoginError.code);
            }
            
          } catch (createError) {
            console.log(`❌ Failed to create user ${user.email}:`, createError);
          }
        } else {
          console.log(`❌ Error checking user ${user.email}:`, userError);
        }
      }
    }
  }
}

// Run all steps
async function runAuthFix() {
  try {
    console.log('==================================================');
    console.log('FIREBASE AUTHENTICATION DIAGNOSTIC AND FIX UTILITY');
    console.log('==================================================');
    console.log('Firebase Project ID:', firebaseConfig.projectId);
    console.log('API Key:', firebaseConfig.apiKey);
    
    // Step 1: Verify API key
    const isApiKeyValid = await verifyApiKey();
    if (!isApiKeyValid) {
      console.log('⚠️ API key verification failed. This might cause authentication issues.');
    }
    
    // Step 2-3: Create and test new user
    const testUser = await createTestUser();
    if (testUser.success) {
      await testSignIn(testUser.email, testUser.password);
    }
    
    // Step 4: Create user with Admin SDK
    const adminUser = await createUserWithAdminSDK();
    
    // Step 5: List users
    await listUsers();
    
    // Step 6: Attempt known user logins
    await attemptKnownUserLogins();
    
    console.log('\n==================================================');
    console.log('AUTHENTICATION FIX PROCESS COMPLETED');
    console.log('==================================================');
    console.log('If you can now log in with any of the accounts, the issue has been fixed.');
    console.log('Please try logging in to your application again with these credentials:');
    console.log('\nADMIN USER:');
    console.log('Email: admin123@gmail.com');
    console.log('Password: Admin12345');
    console.log('\nREGULAR USER:');
    console.log('Email: test@example.com');
    console.log('Password: Test123!');
    console.log('\nYOUR USER:');
    console.log('Email: tmtshwelo21@gmail.com');
    console.log('Password: Thulani1205@');
    console.log('\nNEW TEST USER:');
    if (testUser.success) {
      console.log('Email:', testUser.email);
      console.log('Password:', testUser.password);
    }
    console.log('\nNEW ADMIN USER:');
    if (adminUser.success) {
      console.log('Email:', adminUser.email);
      console.log('Password:', adminUser.password);
    }
  } catch (error) {
    console.error('Error in auth fix process:', error);
  }
}

// Run the fix
runAuthFix().catch(console.error);
