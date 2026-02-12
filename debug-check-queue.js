
require('dotenv').config();
const { db } = require('./src/firebaseAdmin');

async function checkQueue() {
    console.log("Checking promotion_tasks queue...");
    const snapshot = await db.collection('promotion_tasks')
        .where('type', '==', 'platform_post')
        .where('status', '==', 'queued')
        .get();
    
    console.log(`Found ${snapshot.size} queued tasks.`);
    snapshot.forEach(doc => {
        const d = doc.data();
        console.log(`- ID: ${doc.id}`);
        console.log(`  Created: ${d.createdAt}`);
        console.log(`  NextAttempt: ${d.nextAttemptAt}`);
        console.log(`  Now: ${new Date().toISOString()}`);
        console.log(`  Ready: ${!d.nextAttemptAt || new Date(d.nextAttemptAt) <= new Date()}`);
    });
}
checkQueue();
