const admin = require('firebase-admin');
let adminConfig = null;
try { adminConfig = require('./firebaseConfig.server'); } catch (_) { adminConfig = null; }

if (admin.apps.length === 0) {
    // Prefer using a provided service-account JSON when GOOGLE_APPLICATION_CREDENTIALS is set.
    // This avoids accidentally picking up a gcloud user token which can expire.
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
            const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            const saJson = require(saPath);
            admin.initializeApp({
                credential: admin.credential.cert(saJson),
                databaseURL: process.env.FIREBASE_DATABASE_URL || '',
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
                projectId: process.env.FIREBASE_PROJECT_ID || saJson.project_id || ''
            });
            console.log('✅ Firebase Admin initialized using service account JSON from GOOGLE_APPLICATION_CREDENTIALS');
        } catch (e) {
            console.warn('⚠️ Failed to load service account JSON from GOOGLE_APPLICATION_CREDENTIALS:', e.message || e);
            // fallback to applicationDefault() as a last resort
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
                databaseURL: process.env.FIREBASE_DATABASE_URL || '',
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
                projectId: process.env.FIREBASE_PROJECT_ID || ''
            });
            console.log('✅ Firebase Admin initialized using applicationDefault() fallback');
        }
    } else if (adminConfig) {
        admin.initializeApp({
            credential: admin.credential.cert(adminConfig),
            databaseURL: process.env.FIREBASE_DATABASE_URL || '',
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
            projectId: process.env.FIREBASE_PROJECT_ID || ''
        });
        console.log('✅ Firebase Admin initialized with server config');
    } else {
        // Last resort: try applicationDefault()
        admin.initializeApp({
            credential: admin.credential.applicationDefault(),
            databaseURL: process.env.FIREBASE_DATABASE_URL || '',
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
            projectId: process.env.FIREBASE_PROJECT_ID || ''
        });
        console.log('✅ Firebase Admin initialized with applicationDefault() fallback');
    }
}

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });
module.exports = { admin, db };
