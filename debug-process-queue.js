
require('dotenv').config();
const { processNextPlatformTask } = require('./src/services/promotionTaskQueue');

async function run() {
    console.log("Attempting to process one queued platform task...");
    try {
        const result = await processNextPlatformTask();
        if (result) {
            console.log("✅ Task processed successfully!", JSON.stringify(result, null, 2));
        } else {
            console.log("ℹ️ No queued tasks found (or tasks deferred).");
        }
    } catch (e) {
        console.error("❌ Task processing failed:", e);
    }
}

run();
