/**
 * Firebase Configuration
 * 
 * This file centralizes Firebase configuration settings.
 * SECURITY NOTICE: All credentials must be stored in environment variables.
 * Never hardcode credentials in source code.
 */

// Firebase Admin SDK configuration
let adminConfig;

try {
  // Load service account from environment variable as first priority
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('✅ Using FIREBASE_SERVICE_ACCOUNT environment variable');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    adminConfig = {
      credential: require('firebase-admin').credential.cert(serviceAccount),
      projectId: serviceAccount.project_id,
      databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${serviceAccount.project_id}.firebaseio.com`,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`
    };
  } 
  // If environment variable not available, try individual credential fields
  else if (process.env.FIREBASE_PROJECT_ID && 
           process.env.FIREBASE_CLIENT_EMAIL && 
           process.env.FIREBASE_PRIVATE_KEY) {
    console.log('✅ Using individual Firebase credential environment variables');
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    
    adminConfig = {
      credential: require('firebase-admin').credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey
      }),
      projectId: process.env.FIREBASE_PROJECT_ID,
      databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.appspot.com`
    };
  }
  // Try to load from file as the third option
  else {
    try {
      const serviceAccount = require('../serviceAccountKey.json');
      console.log('✅ Using serviceAccountKey.json file');
      
      adminConfig = {
        credential: require('firebase-admin').credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
        databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${serviceAccount.project_id}.firebaseio.com`,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`
      };
    } catch (fileError) {
      // Silent error for file loading, we'll use default credentials
      console.log('ℹ️ No serviceAccountKey.json file found, using application default credentials');
      
      // Create a default configuration with application default credentials
      adminConfig = {
        // This will use application default credentials or environment variables
        credential: require('firebase-admin').credential.applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID,
        databaseURL: process.env.FIREBASE_DATABASE_URL,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
      };
      console.log(`ℹ️ Using application default credentials with project ID: ${adminConfig.projectId || 'unknown'}`);
    }
  }
} catch (error) {
  // Create a default configuration for when all else fails
  console.log('⚠️ Error setting up Firebase config, using application default credentials');
  adminConfig = {
    // This will use application default credentials or environment variables
    credential: require('firebase-admin').credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  };
}

// Firebase Client SDK configuration - NEVER use hardcoded fallbacks in production
const clientConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

module.exports = {
  adminConfig,
  clientConfig
};
