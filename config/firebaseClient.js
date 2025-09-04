/**
 * Firebase Configuration for Client-Side
 * 
 * This file centralizes Firebase configuration settings.
 * SECURITY NOTICE: We use environment variables loaded at build time.
 * Never hardcode credentials in source code.
 */

// Firebase Client SDK configuration for the frontend
// These values are publicly visible in compiled code, but are restricted by Firebase security rules
export const clientConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || ""
};
