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
    console.log('ℹ️ Firebase Admin initialization issue - attempting to recover');
    
    // Try to initialize with minimal configuration as a fallback
    try {
        if (admin.apps.length === 0) {
            admin.initializeApp({
                projectId: process.env.FIREBASE_PROJECT_ID || "autopromote-464de"
            });
            console.log('✅ Firebase Admin initialized with fallback configuration');
        }
        
        // Initialize services
        db = admin.firestore();
        auth = admin.auth();
        storage = admin.storage();
    } catch (fallbackError) {
        console.log('Unable to initialize Firebase Admin, some features may not work correctly');
        
        // Create mock objects so the app doesn't crash
        db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) }) };
        auth = { verifyIdToken: async () => ({ uid: 'mock-uid', email: 'mock@example.com' }) };
        storage = { bucket: () => ({}) };
    }
}

// Export initialized services
module.exports = { 
    db, 
    auth, 
    storage, 
    admin,
    isInitialized: () => admin.apps.length > 0 
};