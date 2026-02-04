
require('dotenv').config();
const { db } = require('./src/firebaseAdmin'); // Adjust path
const fetch = require('node-fetch');

async function getRedditToken() {
    // 1. Find a user with reddit
    console.log("Scanning users...");
    const usersSnap = await db.collection('users').get();
    console.log(`Found ${usersSnap.size} users.`);
    for (const doc of usersSnap.docs) {
        // console.log(`Checking user ${doc.id}`);
        const redditSnap = await db.collection('users').doc(doc.id).collection('connections').doc('reddit').get();
        if (redditSnap.exists) {
            const data = redditSnap.data();
            // Check nested tokens object or root
            const tokens = data.tokens || data; 
            if (tokens && tokens.access_token) {
                console.log(`Found user ${doc.id} with reddit token`);
                return tokens.access_token;
            }
        }
    }
    return null;
}

async function testLease() {
    const token = await getRedditToken();
    if (!token) {
        console.log("No reddit token found");
        return;
    }

    console.log("Token:", token.substring(0, 10) + "...");

    const body = new URLSearchParams({
        filepath: "test_video.mp4",
        mimetype: "video/mp4"
    });

    try {
        const res = await fetch("https://oauth.reddit.com/api/media/asset.json", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "User-Agent": "AutoPromote/1.0",
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: body
        });
        
        const text = await res.text();
        console.log("Status:", res.status);
        console.log("Body:", text);
    } catch (e) {
        console.error(e);
    }
}

testLease();
