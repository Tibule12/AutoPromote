const admin = require('firebase-admin');
const adminConfig = require('./firebaseConfig');

if (admin.apps.length === 0) {
    // Try to load service account from environment variable first
    let serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
        try {
            serviceAccount = JSON.parse(serviceAccount);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: adminConfig.databaseURL,
                storageBucket: adminConfig.storageBucket,
                projectId: serviceAccount.project_id || adminConfig.projectId
            });
            console.log('✅ Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT env');
        } catch (err) {
            console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT:', err);
            admin.initializeApp(adminConfig);
            console.log('✅ Firebase Admin initialized with adminConfig');
        }
    } else {
        // Fallback to config file
        let configServiceAccount = adminConfig.credential;
        if (typeof configServiceAccount === 'string') {
            try {
                configServiceAccount = JSON.parse(configServiceAccount);
            } catch (parseError) {
                console.error('Failed to parse adminConfig.credential:', parseError);
                configServiceAccount = null;
            }
        }
        if (configServiceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(configServiceAccount),
                databaseURL: adminConfig.databaseURL,
                storageBucket: adminConfig.storageBucket,
                projectId: configServiceAccount.project_id || adminConfig.projectId
            });
            console.log('✅ Firebase Admin initialized from adminConfig');
        } else {
            admin.initializeApp(adminConfig);
            console.log('✅ Firebase Admin initialized with adminConfig (no credential)');
        }
    }
}
// ...existing code...
const db = admin.firestore();
module.exports = { admin, db };
