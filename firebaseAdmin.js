// Placeholder for firebaseAdmin.js
// Add Firebase Admin SDK initialization logic here

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://autopromote-cc6d3.firebaseio.com'
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

module.exports = { admin, db };
