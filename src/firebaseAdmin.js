// Lightweight test bypass: when CI_ROUTE_IMPORTS=1 (route import tests) or FIREBASE_ADMIN_BYPASS=1
// we avoid real Firebase initialization and return in-memory stubs. If bypass is enabled
// we do NOT attempt to require the project root `firebaseAdmin.js` to avoid failing
// initialization during import-only test runs.
const bypass = process.env.CI_ROUTE_IMPORTS === '1' || process.env.FIREBASE_ADMIN_BYPASS === '1';
let admin, db;
if (bypass) {
    const firestoreStub = () => ({
        collection: () => ({
            doc: () => ({
                set: async () => {},
                get: async () => ({ exists: false, data: () => ({}) })
            }),
            limit: () => ({ get: async () => ({ empty: true, forEach: () => {} }) }),
            where: () => ({ limit: () => ({ get: async () => ({ empty: true, size: 0, forEach: () => {} }) }) }),
            orderBy: () => ({ limit: () => ({ get: async () => ({ empty: true, forEach: () => {} }) }) })
        })
    });
    // Minimal Timestamp/FieldValue shims used by routes in tests
    firestoreStub.FieldValue = { serverTimestamp: () => new Date() };
    firestoreStub.Timestamp = { fromDate: (d) => d instanceof Date ? d : new Date(d) };
    admin = { apps: ['stub'], firestore: firestoreStub };
    db = admin.firestore();
} else {
    // When not bypassing, import the root project firebaseAdmin module when available
    try {
        module.exports = require('../firebaseAdmin');
        return; // root module handles initialization and exports admin/db
    } catch (e) {
        // Fall back to local initialization path if no root module or it failed to init.
        console.warn('[firebaseAdmin shim] Root firebaseAdmin.js not found or failed to initialize:', e.message);
    }
    admin = require('firebase-admin');
    const adminConfig = require('./firebaseConfig.server.js');
    if (admin.apps.length === 0) {
        // Validate minimal required fields before attempting init to produce more actionable error.
        const required = ['project_id','private_key','client_email'];
        const missing = required.filter(k => !adminConfig[k] || typeof adminConfig[k] !== 'string' || !adminConfig[k].trim());
        if (missing.length) {
            throw new Error(`Firebase Admin missing required fields: ${missing.join(', ')}. Provide either FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_BASE64 or individual FIREBASE_* vars.`);
        }
        try {
            admin.initializeApp({
                credential: admin.credential.cert(adminConfig),
                databaseURL: process.env.FIREBASE_DATABASE_URL || '',
                storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
                projectId: process.env.FIREBASE_PROJECT_ID || adminConfig.project_id
            });
            console.log('✅ Firebase Admin initialized with server config');
        } catch (e) {
            console.error('[firebaseAdmin] Initialization failed:', e.message);
            throw e;
        }
    }
    db = admin.firestore();
}
module.exports = { admin, db };
