const admin = require('firebase-admin');
const { adminConfig } = require('./config/firebase');

let db, auth, storage;

try {
    // Use the config from our centralized firebase config
    if (admin.apps.length === 0) {
        admin.initializeApp(adminConfig);
        console.log('✅ Firebase Admin initialized successfully');
    }

    // Initialize Firestore with custom settings
    db = admin.firestore();
    db.settings({
        ignoreUndefinedProperties: true,
        timestampsInSnapshots: true
    });

    // Initialize other services
    auth = admin.auth();
    storage = admin.storage();

} catch (error) {
    console.error('❌ Error initializing Firebase Admin:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
}

// Export initialized services
module.exports = { 
    db, 
    auth, 
    storage, 
    admin,
    isInitialized: () => admin.apps.length > 0 
};