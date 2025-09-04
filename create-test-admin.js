const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

async function createTestAdmin() {
  console.log('🔧 Creating test admin user...\n');

  const adminEmail = 'testadmin@example.com';
  const adminPassword = 'admin123';

  try {
    // Check if user already exists
    let userRecord;
    try {
      userRecord = await admin.auth().getUserByEmail(adminEmail);
      console.log(`User already exists: ${userRecord.uid}`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        // Create user
        userRecord = await admin.auth().createUser({
          email: adminEmail,
          password: adminPassword,
          displayName: 'Test Admin'
        });
        console.log('✅ Firebase Auth user created:', userRecord.uid);
      } else {
        throw error;
      }
    }

    // Set admin custom claims
    await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true, role: 'admin' });
    console.log('✅ Admin claims set successfully');

    // Create user document in Firestore
    const userData = {
      uid: userRecord.uid,
      email: adminEmail,
      displayName: 'Test Admin',
      role: 'admin',
      isAdmin: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      balance: 0,
      totalEarnings: 0,
      subscriptionPlan: 'free',
      subscriptionStatus: 'inactive'
    };

    const db = admin.firestore();
    await db.collection('users').doc(userRecord.uid).set(userData);
    console.log('✅ User document created in Firestore');

    console.log('\n🎉 Test admin user created successfully!');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${adminPassword}`);
    console.log(`UID: ${userRecord.uid}`);

    return { email: adminEmail, password: adminPassword, uid: userRecord.uid };

  } catch (error) {
    console.error('❌ Failed to create admin user:', error.message);
    return null;
  }
}

createTestAdmin().catch(console.error);
