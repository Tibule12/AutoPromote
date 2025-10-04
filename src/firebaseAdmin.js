// Lightweight test bypass: when CI_ROUTE_IMPORTS=1 (route import tests) or FIREBASE_ADMIN_BYPASS=1
// we avoid real Firebase initialization and return in-memory stubs.
const bypass = process.env.CI_ROUTE_IMPORTS === '1' || process.env.FIREBASE_ADMIN_BYPASS === '1';
let admin, db;
if (bypass) {
    admin = { apps: ['stub'], firestore: () => ({ collection: () => ({ doc: () => ({ set: async()=>{}, get: async()=>({ exists:false, data:()=>({}) }) }), limit:()=>({ get: async()=>({ empty:true, forEach:()=>{} }) }), where:()=>({ limit:()=>({ get: async()=>({ empty:true, size:0, forEach:()=>{} }) }) }), orderBy:()=>({ limit:()=>({ get: async()=>({ empty:true, forEach:()=>{} }) }) }) }) }) };
    db = admin.firestore();
} else {
    admin = require('firebase-admin');
    const adminConfig = require('./firebaseConfig.server.js');
    if (admin.apps.length === 0) {
        admin.initializeApp({
            credential: admin.credential.cert(adminConfig),
            databaseURL: process.env.FIREBASE_DATABASE_URL || '',
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
            projectId: process.env.FIREBASE_PROJECT_ID || ''
        });
        console.log('✅ Firebase Admin initialized with server config');
    }
    db = admin.firestore();
}
module.exports = { admin, db };
