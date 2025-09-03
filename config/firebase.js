/**
 * Firebase Configuration
 * 
 * This file centralizes Firebase configuration settings.
 * For production, all these values should be set in environment variables.
 */

// Firebase Admin SDK configuration
let adminConfig;

try {
  // Load service account from environment variable as first priority
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log('Using FIREBASE_SERVICE_ACCOUNT environment variable');
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
    console.log('Using individual Firebase credential environment variables');
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
  // Last option - try to load from file
  else {
    try {
      console.log('Attempting to load service account from file');
      const serviceAccount = require('../serviceAccountKey.json');
      
      adminConfig = {
        credential: require('firebase-admin').credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
        databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${serviceAccount.project_id}.firebaseio.com`,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`
      };
    } catch (fileError) {
      console.error('Could not load serviceAccountKey.json:', fileError.message);
      throw new Error('No Firebase credentials available');
    }
  }
} catch (error) {
  console.error('Error loading Firebase admin configuration:', error);
  
  // Provide a fallback for development/testing without failing immediately
  console.warn('⚠️ WARNING: Using application default credentials. This may not work in production.');
  adminConfig = {
    // This will use application default credentials or environment variables
    credential: require('firebase-admin').credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || "autopromote-464de",
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  };
}

// Firebase Client SDK configuration
const clientConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "autopromote-464de.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "autopromote-464de",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "autopromote-464de.firebasestorage.app",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "317746682241",
  appId: process.env.FIREBASE_APP_ID || "1:317746682241:web:f363e099d55ffd1af1b080"
};

module.exports = {
  adminConfig,
  clientConfig
};
