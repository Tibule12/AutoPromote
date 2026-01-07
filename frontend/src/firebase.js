// Fix for legacy imports referencing "../firebase" instead of "../firebaseClient"
// This file simply re-exports everything from firebaseClient.js

import { app, auth, db, storage } from "./firebaseClient";

export * from "./firebaseClient";

// Create a default export object for consumers expecting "import firebase from './firebase'"
const firebaseDefault = { app, auth, db, storage };
export default firebaseDefault;
