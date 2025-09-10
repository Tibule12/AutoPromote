import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase configuration with hardcoded values for consistent behavior
// especially important for GitHub Pages deployment
const firebaseConfig = {
  apiKey: "AIzaSyASTUuMkz821PoHRopZ8yy1dW5COrAQPZY",
  authDomain: "autopromote-464de.firebaseapp.com",
  projectId: "autopromote-464de",
  storageBucket: "autopromote-464de.firebasestorage.app",
  messagingSenderId: "317746682241",
  appId: "1:317746682241:web:f363e099d55ffd1af1b080",
  measurementId: "G-8QDQXF0FPQ"
};

// Firebase initialized successfully

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Export the app for use in other components
export { app };
