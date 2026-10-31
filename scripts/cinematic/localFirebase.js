// Build-time isolation adapter for the engineering shell only. No Firebase SDK,
// credentials, account sessions, production database or storage can be reached.
export const auth = { currentUser: null };
export const storage = {}, db = {};
export const getAuth = () => auth;
export const onAuthStateChanged = (_auth, callback) => { callback(null); return () => {}; };
const unavailable = () => { throw new Error("Firebase access is disabled in isolated cinematic Studio"); };
export const ref = unavailable, uploadBytes = unavailable, getDownloadURL = unavailable, uploadBytesResumable = unavailable;
