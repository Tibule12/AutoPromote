// Lightweight test bypass: when CI_ROUTE_IMPORTS=1 (route import tests) or FIREBASE_ADMIN_BYPASS=1
// we avoid real Firebase initialization and return in-memory stubs.
const bypass = process.env.CI_ROUTE_IMPORTS === '1' || process.env.FIREBASE_ADMIN_BYPASS === '1';

if (bypass) {
    // In bypass mode, create minimal stubs for testing
    const firestoreStub = () => ({
        collection: () => ({
            doc: () => ({
                set: async () => {},
                get: async () => ({ exists: false, data: () => ({}) }),
                update: async () => {},
                delete: async () => {}
            }),
            add: async () => ({ id: 'stub-id' }),
            limit: () => ({ get: async () => ({ empty: true, forEach: () => {}, docs: [], size: 0 }) }),
            where: () => ({ 
                limit: () => ({ get: async () => ({ empty: true, size: 0, forEach: () => {}, docs: [] }) }),
                get: async () => ({ empty: true, size: 0, forEach: () => {}, docs: [] })
            }),
            orderBy: () => ({ 
                limit: () => ({ get: async () => ({ empty: true, forEach: () => {}, docs: [], size: 0 }) }),
                get: async () => ({ empty: true, forEach: () => {}, docs: [], size: 0 })
            }),
            get: async () => ({ empty: true, forEach: () => {}, docs: [], size: 0 })
        })
    });
    // Minimal Timestamp/FieldValue shims
    firestoreStub.FieldValue = { serverTimestamp: () => new Date(), delete: () => null };
    firestoreStub.Timestamp = { 
        fromDate: (d) => d instanceof Date ? d : new Date(d),
        now: () => new Date()
    };
    
    const admin = { 
        apps: ['stub'], 
        firestore: firestoreStub,
        auth: () => ({ verifyIdToken: async () => ({ uid: 'stub-uid' }) })
    };
    const db = admin.firestore();
    
    module.exports = { admin, db };
} else {
    // When not bypassing, try to use root firebaseAdmin module first
    try {
        module.exports = require('../firebaseAdmin');
    } catch (e) {
        // Fall back to local initialization if root module not available
        console.warn('[firebaseAdmin shim] Root firebaseAdmin.js not found, using local init:', e.message);
        
        const admin = require('firebase-admin');
        const adminConfig = require('../firebaseConfig.server.js');
        
        if (admin.apps.length === 0) {
            // Validate minimal required fields
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
            } catch (initError) {
                console.error('[firebaseAdmin] Initialization failed:', initError.message);
                throw initError;
            }
        }
        
        const db = admin.firestore();
        module.exports = { admin, db };
    }
}
