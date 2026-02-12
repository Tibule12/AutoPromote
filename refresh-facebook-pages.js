
require('dotenv').config();
const { db } = require('./src/firebaseAdmin');
const { decryptToken, encryptToken } = require('./src/services/secretVault');
const fetch = require('node-fetch');

const uid = 'bf04dPKELvVMivWoUyLsAVyw2sg2';

async function refreshPages() {
    console.log("Reading Facebook Connection...");
    const ref = db.collection('users').doc(uid).collection('connections').doc('facebook');
    const doc = await ref.get();
    
    if (!doc.exists) {
        console.log("❌ No connection doc found!");
        return;
    }

    const data = doc.data();
    
    // 1. Get User Token
    if (!data.encrypted_user_access_token) {
        console.log("❌ No user token found.");
        return;
    }

    const userToken = decryptToken(data.encrypted_user_access_token);
    if (!userToken || userToken === data.encrypted_user_access_token) {
        console.log("❌ Failed to decrypt user token.");
        return;
    }
    console.log("✅ Decrypted User Token successfully.");

    // 2a. Check Permissions
    console.log("Checking permissions...");
    const permRes = await fetch(`https://graph.facebook.com/v19.0/me/permissions?access_token=${userToken}`);
    const permData = await permRes.json();
    if (permData.data) {
        console.log("Granted Permissions:", permData.data.filter(p => p.status === 'granted').map(p => p.permission).join(', '));
    }

    // 2b. Fetch Pages from Graph API
    console.log("Fetching pages from Facebook...");
    let pages = [];
    
    // Attempt 1: Standard /me/accounts
    const accountsUrl = `https://graph.facebook.com/v19.0/me/accounts?fields=name,access_token,id,instagram_business_account{id,username,name,profile_picture_url}&access_token=${userToken}`;
    const res = await fetch(accountsUrl);
    const pageData = await res.json();
    
    if (pageData.data && pageData.data.length > 0) {
        pages = pageData.data;
    } else {
        console.log("⚠️ /me/accounts returned empty. Trying granular targets from debug_token...");
        // Attempt 2: Check debug_token for target_ids
        const appId = process.env.FB_CLIENT_ID;
        const appSecret = process.env.FB_CLIENT_SECRET;
        const debugUrl = `https://graph.facebook.com/debug_token?input_token=${userToken}&access_token=${appId}|${appSecret}`;
        const debugRes = await fetch(debugUrl);
        const debugOut = await debugRes.json();
        
        const granular = debugOut.data?.granular_scopes || [];
        const manageScope = granular.find(s => s.scope === 'pages_manage_posts' || s.scope === 'pages_show_list');
        
        if (manageScope && manageScope.target_ids) {
            console.log(`Found explicit target IDs: ${manageScope.target_ids.join(', ')}`);
            for (const targetId of manageScope.target_ids) {
                console.log(`Fetching specific page details for ID: ${targetId}`);
                const pageUrl = `https://graph.facebook.com/v19.0/${targetId}?fields=name,access_token,id,instagram_business_account{id,username,name,profile_picture_url}&access_token=${userToken}`;
                const pRes = await fetch(pageUrl);
                const pData = await pRes.json();
                if (pData.id) {
                    pages.push(pData);
                } else {
                    console.log(`Failed to fetch page ${targetId}:`, pData);
                }
            }
        }
    }

    console.log(`Found ${pages.length} pages total.`);

    if (pages.length === 0) {
        console.log("⚠️ No pages returned from Facebook. User might need to grant permission.");
        return;
    }

    // 3. Encrypt and Update
    const updatedPages = pages.map(p => {
        const encToken = encryptToken(p.access_token);
        // Remove plaintext access_token from storage
        const { access_token, ...rest } = p; 
        return {
            ...rest,
            encrypted_access_token: encToken
        };
    });

    console.log("Updating DB with fresh page tokens...");
    await ref.update({ pages: updatedPages, updatedAt: new Date().toISOString() });
    console.log("✅ Pages updated successfully!");
}

refreshPages().catch(console.error);
