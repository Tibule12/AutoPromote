
require('dotenv').config();
const { db } = require('./src/firebaseAdmin');

const taskId = "7tyqlexIbYWrpYcvxnx3"; // New task 

async function check() {
    console.log(`Checking task ${taskId}...`);
    const doc = await db.collection('promotion_tasks').doc(taskId).get();
    if (!doc.exists) {
        console.log("Task doc does not exist (maybe verified and deleted?)");
        
        // Check verification_results collection if verify-fix moves it there? 
        // No, verifying script usually just logs it.
        // But maybe it failed and was deleted?
        
        // Let's check generally for recent tasks
        console.log("Checking recent tasks...");
        const snap = await db.collection('promotion_tasks')
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get();
            
        snap.forEach(d => {
            console.log(`\nID: ${d.id}`);
            console.log(`Status: ${d.data().status}`);
            console.log("Outcome:", JSON.stringify(d.data().outcome, null, 2));
            console.log("Error:", d.data().error);
        });
        return;
    }

    const data = doc.data();
    console.log("Status:", data.status);
    console.log("Outcome:", JSON.stringify(data.outcome, null, 2));
    console.log("Error:", data.error);
}

check().catch(console.error);
