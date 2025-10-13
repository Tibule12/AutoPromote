const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
try {
  admin.app();
  console.log('Firebase Admin already initialized');
} catch (error) {
  const serviceAccount = require('./serviceAccountKey.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://autopromote-cc6d3.firebaseio.com"
  });
  console.log('Firebase Admin initialized');
}

async function checkAdminCollection() {
  try {
    console.log('Checking admin collection status...');
    
    // Get all admin documents
    const adminsSnapshot = await admin.firestore().collection('admins').get();
    console.log(`Found ${adminsSnapshot.size} admin documents.`);
    
    // Log each admin document
    if (adminsSnapshot.size > 0) {
      adminsSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`Admin ID: ${doc.id}`);
        console.log(`- Email: ${data.email}`);
        console.log(`- Name: ${data.name}`);
        console.log(`- Role: ${data.role}`);
        console.log(`- IsAdmin: ${data.isAdmin}`);
        console.log('-----------------------------------');
      });
    } else {
      console.log('No admin documents found. Try running setup-admin-user.js first.');
    }
    
    // Check if the specific admin email exists
    const targetEmail = 'admin123@gmail.com';
    const userByEmailQuery = await admin.firestore().collection('admins')
      .where('email', '==', targetEmail)
      .get();
    
    if (userByEmailQuery.empty) {
      console.log(`\nAdmin with email ${targetEmail} not found in the admins collection.`);
      console.log('Try running setup-admin-user.js to create this admin.');
    } else {
      console.log(`\nAdmin with email ${targetEmail} found:`);
      userByEmailQuery.forEach(doc => {
        console.log(`- Document ID: ${doc.id}`);
        console.log(`- Data: ${JSON.stringify(doc.data(), null, 2)}`);
      });
    }
  } catch (error) {
    console.error('Error checking admin collection:', error);
  }
}

// Run the check
checkAdminCollection()
  .then(() => {
    console.log('\nCheck completed. If no admins were found, run setup-admin-user.js');
    setTimeout(() => process.exit(0), 1000);
  })
  .catch(error => {
    console.error('Check failed:', error);
    process.exit(1);
  });
