
require('dotenv').config();
const { db } = require('./src/firebaseAdmin');

async function checkRecentTasks() {
    console.log("Checking ALL recent promotion_tasks...");
    
    // Get all tasks (scan for recent ones manually if needed, or query by time)
    // Firestore queries by string comparisons on ISO dates work well.
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    const snapshot = await db.collection('promotion_tasks')
        .where('createdAt', '>=', tenMinutesAgo)
        .get();
    
    console.log(`Found ${snapshot.size} tasks created in last 10 mins.`);
    snapshot.forEach(doc => {
        const d = doc.data();
        console.log(`- ID: ${doc.id}`);
        console.log(`  Type: ${d.type}`);
        console.log(`  Status: ${d.status}`);
        console.log(`  Platform: ${d.platform}`);
        console.log(`  Reason: ${d.reason}`);
        console.log(`  Error: ${d.error || 'none'}`);
    });
}
checkRecentTasks();
