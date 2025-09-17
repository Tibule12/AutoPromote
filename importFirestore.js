// importFirestore.js
// Imports all collections and documents into your new Firestore project
// Usage: node importFirestore.js

const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('./serviceAccountKey.json'); // Your NEW project's service account key

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function importAllCollections() {
  const importData = JSON.parse(fs.readFileSync('firestore-export.json', 'utf8'));
  for (const [collectionName, docs] of Object.entries(importData)) {
    for (const doc of docs) {
      await db.collection(collectionName).doc(doc.id).set(doc.data);
      console.log(`Imported doc ${doc.id} into collection: ${collectionName}`);
    }
  }
  console.log('Import complete.');
}

importAllCollections().catch(console.error);
