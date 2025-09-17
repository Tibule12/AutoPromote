import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Firebase configuration with hardcoded values for consistent behavior
// especially important for GitHub Pages deployment
const firebaseConfig = {
  apiKey: "AIzaSyBA9It1gCyKBpqAhGM5TxwdNoe68c3qEBE",
  authDomain: "autopromote-cc6d3.firebaseapp.com",
  projectId: "autopromote-cc6d3",
  storageBucket: "autopromote-cc6d3.appspot.com",
  messagingSenderId: "341498038874",
  appId: "1:341498038874:web:eb3806b3073a005534a663",
  measurementId: "G-KQQD12JFRM"
};

// Firebase initialized successfully

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Export the app for use in other components
export { app };
