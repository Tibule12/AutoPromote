// exportFirestore.js
// Exports all collections and documents from your old Firestore project
// Usage: node exportFirestore.js

const admin = require('firebase-admin');
const fs = require('fs');
const serviceAccount = require('./oldServiceAccountKey.json'); // Place your OLD project's service account key here

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function exportAllCollections() {
  const collections = await db.listCollections();
  const exportData = {};
  for (const collection of collections) {
    const snapshot = await collection.get();
    exportData[collection.id] = [];
    snapshot.forEach(doc => {
      exportData[collection.id].push({ id: doc.id, data: doc.data() });
    });
    console.log(`Exported ${snapshot.size} docs from collection: ${collection.id}`);
  }
  fs.writeFileSync('firestore-export.json', JSON.stringify(exportData, null, 2));
  console.log('Export complete. Data saved to firestore-export.json');
}

exportAllCollections().catch(console.error);
