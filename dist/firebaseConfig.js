// Import Firebase modules for client-side usage
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

// Import the client config from our centralized config
import { clientConfig } from './config/firebaseClient.js';

// Initialize Firebase with the client configuration
const app = initializeApp(clientConfig);
const auth = getAuth(app);
const storage = getStorage(app);

export { app, auth, storage };
