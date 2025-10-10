const admin = require('firebase-admin');
const adminConfig = require('./firebaseConfig.server');

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(adminConfig),
        databaseURL: process.env.FIREBASE_DATABASE_URL || '',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
        projectId: process.env.FIREBASE_PROJECT_ID || ''
    });
    console.log('✅ Firebase Admin initialized with server config');
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
module.exports = { admin, db };
