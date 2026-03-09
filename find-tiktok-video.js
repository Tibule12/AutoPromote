const admin = require('firebase-admin');
const serviceAccount = require('./service-account-key.json');
const fetch = require('node-fetch');
require('dotenv').config(); // Load environment variables!
const { tokensFromDoc } = require('./src/services/connectionTokenUtils'); // Use the decryption utility

if (admin.apps.length === 0) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const uid = 'bf04dPKELvVMivWoUyLsAVyw2sg2';
const targetTitle = 'what makes a person stand out';
const contentId = 'YSg42Cyj0t17NwcOKbaI';

async function main() {
    const db = admin.firestore();
    
    // 1. Get Token
    console.log('Fetching TikTok token...');
    const connSnap = await db.collection('users').doc(uid).collection('connections').doc('tiktok').get();
    if (!connSnap.exists) { console.error('No connection found'); return; }
    
    const conn = connSnap.data();
    console.log('Connection Data:', JSON.stringify(conn, null, 2));

    // Start Decryption Fix
    const tokenObj = tokensFromDoc(conn);
    const token = tokenObj ? tokenObj.access_token : null;
    // End Decryption Fix
    
    if (!token) { console.error('No access token found in document'); return; }
    console.log('Token found (length):', token.length);

    // 2. Call TikTok List API
    console.log('Calling TikTok API for video list...');
    // Add create_time to fields
    const fields = 'id,title,video_description,share_url,view_count,like_count,comment_count,share_count,create_time';
    const url = `https://open.tiktokapis.com/v2/video/list/?fields=${fields}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ max_count: 20 })
    });

    const body = await response.json();
    
    // TikTok returns error object even on success, with code 'ok'
    if (body.error && body.error.code !== 'ok') {
        console.error('TikTok API Error:', JSON.stringify(body, null, 2));
        return;
    }
    
    const videos = body.data ? body.data.videos : [];
    console.log(`Fetched ${videos.length} videos.`);
    
    // DEBUG: Print top 5 videos details
    console.log('--- Top 5 Videos ---');
    videos.slice(0, 5).forEach((v, i) => {
        console.log(`[${i}] ID: ${v.id}, Created: ${v.create_time}, Views: ${v.view_count}, Title: "${v.title || v.video_description || ''}"`);
    });
    console.log('--------------------');
    
    // 3. Find Matching Video
    const match = videos.find(v => {
        const title = v.title || v.video_description || '';
        return title.toLowerCase().includes('stand out'); // looser match
    });
    
    if (match) {
        console.log('\n--- MATCH FOUND! ---');
        console.log('ID:', match.id);
        console.log('Title:', match.title);
        console.log('Share URL:', match.share_url);
        console.log('Views:', match.view_count);
        console.log('Likes:', match.like_count);
        
        // 4. Update Content Document
        console.log(`Updating content/${contentId}...`);
        await db.collection('content').doc(contentId).update({
            'distribution.tiktok.details.id': match.id,
            'distribution.tiktok.details.share_url': match.share_url,
            'tiktok.id': match.id,
            'tiktok.url': match.share_url,
            'tiktok.stats': {
                viewCount: match.view_count || 0,
                likeCount: match.like_count || 0,
                commentCount: match.comment_count || 0,
                shareCount: match.share_count || 0
            }
        });
        
        // 5. Update Analytics Document
        console.log(`Updating analytics/${contentId}...`);
        await db.collection('analytics').doc(contentId).set({
            tiktok: {
                views: match.view_count || 0,
                likes: match.like_count || 0,
                comments: match.comment_count || 0,
                shares: match.share_count || 0,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            stats: {
                viewCount: match.view_count || 0,
                likeCount: match.like_count || 0
            }
        }, { merge: true });
        
        console.log('SUCCESS: Database updated.');
    } else {
        console.log('No matching video found in the last 20 posts.');
        console.log('Titles found:', videos.map(v => v.title || v.video_description));
    }
}

main().catch(console.error);
