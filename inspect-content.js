
require('dotenv').config();
const { db } = require('./src/firebaseAdmin');

const contentId = 'WqFlO0v8puuJLWuaTnQ4';

async function inspectContent() {
    console.log(`Reading content ${contentId}...`);
    const doc = await db.collection('content').doc(contentId).get();
    
    if (!doc.exists) {
        console.log("❌ Content doc not found!");
        return;
    }

    const data = doc.data();
    console.log("--- Content Data ---");
    console.log("Title:", data.title);
    console.log("Description:", data.description);
    console.log("Link:", data.link);
    console.log("Image URL:", data.imageUrl);
    console.log("Video URL:", data.videoUrl);
    console.log("Type:", data.type);
    console.log("--------------------");
}

inspectContent().catch(console.error);
