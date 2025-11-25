const admin = require('firebase-admin');
// Diagnostic: log google-gax and @grpc/grpc-js versions/paths and whether 'single-subchannel-channel.js' exists
try {
    const fs = require('fs');
    const path = require('path');
    try {
        const gaxPkg = require('google-gax/package.json');
        const gaxResolved = require.resolve('google-gax');
        let grpcInfo = 'not installed';
        try {
            const grpcPkgPath = require.resolve('@grpc/grpc-js/package.json');
            const grpcPkg = require('@grpc/grpc-js/package.json');
            // Try to find single-subchannel-channel.js based on known build structure
            let singleSubExists = false;
            try {
                // Look for known file locations across versions
                const potentialPaths = [
                    path.join(path.dirname(require.resolve('@grpc/grpc-js/package.json')), 'build', 'src', 'single-subchannel-channel.js'),
                    path.join(path.dirname(require.resolve('@grpc/grpc-js/package.json')), 'build', 'src', 'single_subchannel_channel.js'),
                    path.join(path.dirname(require.resolve('@grpc/grpc-js/package.json')), 'src', 'single-subchannel-channel.js')
                ];
                for (const p of potentialPaths) {
                    if (fs.existsSync(p)) { singleSubExists = true; break; }
                }
            } catch (_) { singleSubExists = false; }
            grpcInfo = `@grpc/grpc-js@${grpcPkg.version} at ${grpcPkgPath} (has single-subchannel-channel: ${singleSubExists})`;
        } catch (e) {
            grpcInfo = `@grpc/grpc-js missing (${e && e.message})`;
        }
        console.log(`[diagnostic] google-gax@${gaxPkg.version} at ${gaxResolved}; ${grpcInfo}`);
    } catch (e) {
        console.warn('[diagnostic] google-gax not found:', e && e.message);
    }
} catch (e) {
    // Do not block startup on diagnostics
    console.warn('[diagnostic] internal check failed:', e && e.message);
}
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
