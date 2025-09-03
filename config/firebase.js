/**
 * Firebase Configuration
 * 
 * This file centralizes Firebase configuration settings.
 * For production, all these values should be set in environment variables.
 */

// Firebase Admin SDK configuration
let adminConfig;

try {
  // Load service account from environment variable or file
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : require('../serviceAccountKey.json');

  adminConfig = {
    credential: require('firebase-admin').credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
    databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${serviceAccount.project_id}.firebaseio.com`,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "autopromote-464de.firebasestorage.app"
  };
} catch (error) {
  console.error('Error loading Firebase admin configuration:', error);
  // Provide a fallback for development/testing without failing immediately
  adminConfig = {
    // This will need proper credentials to work
    credential: require('firebase-admin').credential.applicationDefault(),
    projectId: process.env.FIREBASE_PROJECT_ID || "autopromote-464de"
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
