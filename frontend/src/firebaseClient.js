import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

// Firebase configuration using environment variables for security
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Firebase initialized successfully

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Explicit demo-only build. This branch cannot redirect the live website to emulators.
if (process.env.REACT_APP_CREDITS_PILOT === "true") {
  if (
    window.location.hostname !== "127.0.0.1" ||
    firebaseConfig.projectId !== "demo-autopromote-credits"
  )
    throw new Error("Credit pilot requires the local demo origin and project");
  const endpoint = name => {
    const value = new URL(process.env[name]);
    if (value.hostname !== "127.0.0.1" || value.protocol !== "http:")
      throw new Error("Loopback emulator required");
    return value;
  };
  const authUrl = endpoint("REACT_APP_CREDITS_AUTH_EMULATOR");
  const firestoreUrl = endpoint("REACT_APP_CREDITS_FIRESTORE_EMULATOR");
  const storageUrl = endpoint("REACT_APP_CREDITS_STORAGE_EMULATOR");
  connectAuthEmulator(auth, authUrl.origin, { disableWarnings: true });
  connectFirestoreEmulator(db, firestoreUrl.hostname, Number(firestoreUrl.port));
  connectStorageEmulator(storage, storageUrl.hostname, Number(storageUrl.port));
}

// Export the app for use in other components
export { app };
