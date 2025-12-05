// add-test-connections.js
// Script to add test platform connections to Firestore

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function addTestConnections(userId) {
  try {
    console.log(`Adding test platform connections for user: ${userId}`);

    const connectionsRef = db.collection('users').doc(userId).collection('connections');

    // Add Facebook connection
    await connectionsRef.doc('facebook').set({
      provider: 'facebook',
      connected: true,
      obtainedAt: new Date().toISOString(),
      mode: 'active',
      scope: 'pages_manage_posts,pages_read_engagement',
      pages: [
        {
          id: 'test_page_123',
          name: 'My Test Page',
          access_token: 'test_token_facebook'
        }
      ],
      identity: {
        id: 'fb_user_123',
        name: 'Test User'
      }
    });
    console.log('✅ Added Facebook connection');

    // Add YouTube connection
    await connectionsRef.doc('youtube').set({
      provider: 'youtube',
      connected: true,
      obtainedAt: new Date().toISOString(),
      mode: 'active',
      scope: 'youtube.upload,youtube.readonly',
      channel: {
        id: 'test_channel_123',
        snippet: {
          title: 'My YouTube Channel'
        }
      },
      identity: {
        id: 'yt_user_123',
        email: 'test@youtube.com'
      }
    });
    console.log('✅ Added YouTube connection');

    // Add Twitter connection
    await connectionsRef.doc('twitter').set({
      provider: 'twitter',
      connected: true,
      obtainedAt: new Date().toISOString(),
      mode: 'active',
      scope: 'tweet.read,tweet.write,users.read',
      identity: {
        id: 'twitter_123',
        username: 'testuser',
        name: 'Test User'
      }
    });
    console.log('✅ Added Twitter connection');

    // Add TikTok connection
    await connectionsRef.doc('tiktok').set({
      provider: 'tiktok',
      connected: true,
      obtainedAt: new Date().toISOString(),
      mode: 'active',
      scope: 'video.upload,user.info.basic',
      display_name: '@testuser',
      identity: {
        open_id: 'tiktok_123',
        display_name: 'Test TikTok User'
      }
    });
    console.log('✅ Added TikTok connection');

    // Add Instagram connection
    await connectionsRef.doc('instagram').set({
      provider: 'instagram',
      connected: true,
      obtainedAt: new Date().toISOString(),
      mode: 'active',
      scope: 'instagram_basic,instagram_content_publish',
      identity: {
        id: 'ig_123',
        username: 'testuser'
      }
    });
    console.log('✅ Added Instagram connection');

    // Add LinkedIn connection
    await connectionsRef.doc('linkedin').set({
      provider: 'linkedin',
      connected: true,
      obtainedAt: new Date().toISOString(),
      mode: 'active',
      scope: 'w_member_social,r_liteprofile',
      meta: {
        organizations: [
          {
            id: 'org_123',
            name: 'Test Company'
          }
        ]
      },
      identity: {
        id: 'li_123',
        firstName: 'Test',
        lastName: 'User'
      }
    });
    console.log('✅ Added LinkedIn connection');

    console.log('\n🎉 All test connections added successfully!');
    console.log('Go to your dashboard and check the Security Panel → Connected Platforms section');

  } catch (error) {
    console.error('❌ Error adding test connections:', error);
  }
}

// Get userId from command line argument
const userId = process.argv[2];

if (!userId) {
  console.error('❌ Please provide a userId as argument');
  console.log('Usage: node add-test-connections.js YOUR_USER_ID');
  console.log('\nTo find your user ID:');
  console.log('1. Open browser console on your dashboard');
  console.log('2. Run: firebase.auth().currentUser.uid');
  console.log('3. Copy the UID and use it here');
  process.exit(1);
}

addTestConnections(userId).then(() => {
  console.log('\n✅ Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});
