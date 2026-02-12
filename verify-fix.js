
require('dotenv').config();
const { db } = require('./src/firebaseAdmin');
const { enqueuePlatformPostTask, processNextPlatformTask } = require('./src/services/promotionTaskQueue');
// We need to re-require this to ensure it picks up the latest env if changed, though mostly node caches modules.

const scheduleId = 'Ol0fW8J9NYJ6Wd76tUjh';
// const contentId = 'WqFlO0v8puuJLWuaTnQ4'; // Old malformed content
const uid = 'bf04dPKELvVMivWoUyLsAVyw2sg2';

async function verify() {
    // 1. Create a FRESH valid test content item
    console.log("📝 Creating fresh valid test content...");
    const contentRef = db.collection('content').doc();
    const contentId = contentRef.id;
    await contentRef.set({
        uid,
        type: 'post', // simple text post
        title: 'AutoPromote Verification',
        description: `This is a verification post from AutoPromote at ${new Date().toISOString()}`,
        createdAt: new Date().toISOString(),
        // No videoUrl or imageUrl to ensure simple path
    });
    console.log(`Created test content: ${contentId}`);

    console.log("🧹 Cleaning up old queued tasks to avoid duplicate blocks...");
    const snapshot = await db.collection('promotion_tasks')
        .where('type', '==', 'platform_post')
        .where('contentId', '==', contentId)
        .where('status', 'in', ['queued', 'processing']) // clear processing ones too if stuck
        .get();
    
    if (!snapshot.empty) {
        const batch = db.batch();
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        console.log(`Deleted ${snapshot.size} blocking tasks.`);
    } else {
        console.log("No blocking tasks found.");
    }

    console.log("🚀 Enqueuing NEW verification task...");
    // Use a unique reason to ensure no hash collision even if cleanup missed something
    const uniqueReason = "verify_fix_" + Date.now();
    
    const enqueueResult = await enqueuePlatformPostTask({
        contentId,
        uid,
        platform: 'facebook',
        reason: uniqueReason,
        payload: {
            scheduleId,
            verification_run: true
        },
        skipIfDuplicate: false // Force it
    });

    console.log("Task ID:", enqueueResult.id);

    console.log("⚙️ Processing task immediately...");
    // We loop briefly because sometimes indexes or latency might make it invisible for a split second, 
    // though usually direct write-then-read is consistent in Firestore.
    let processedResult = null;
    for (let i = 0; i < 3; i++) {
        processedResult = await processNextPlatformTask();
        if (processedResult) break;
        await new Promise(r => setTimeout(r, 1000));
    }

    if (processedResult) {
        console.log("\n✅ RESULT:");
        console.log(JSON.stringify(processedResult, null, 2));
    } else {
        console.log("\n❌ Could not pick up the task (Queue might be empty or query mismatch).");
    }
}

verify().then(() => process.exit());
