
const { db } = require('./autopromote-functions/_server/src/firebaseAdmin');

const TARGET_UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";

async function checkFacebookPages() {
    console.log("Checking Facebook Connection Details...");
    try {
        const snap = await db.collection('users').doc(TARGET_UID).collection('connections').doc('facebook').get();
        if (snap.exists) {
            const data = snap.data();
            console.log("--- Facebook Connection Data ---");
            console.log("Pages Array Length:", data.pages ? data.pages.length : "N/A");
            
            if (data.pages && Array.isArray(data.pages)) {
                console.log("Pages found:", data.pages.length);
                data.pages.forEach((p, i) => {
                    console.log(`Page [${i}]: ${p.name} (ID: ${p.id})`);
                    console.log(`   - Instagram:`, p.instagram_business_account ? "YES" : "NO");
                });
            } else {
                console.log("Pages: ", data.pages);
            }

            console.log("Has Access Token:", !!(data.user_access_token || data.encrypted_user_access_token));
            
            // Try explicit fetch
            if (data.user_access_token) {
                console.log("Attempting explicit API fetch to verify pages...");
                const fetch = require('node-fetch'); // Ensure fetch is available
                // If node-fetch is not installed, use built-in fetch (Node 18+) or skip
                // Assuming environment has fetch
                try {
                  const url = `https://graph.facebook.com/v19.0/me/accounts?fields=name,access_token,id,instagram_business_account{id,username,name,profile_picture_url}&access_token=${data.user_access_token}`;
                  const res = await fetch(url);
                  const json = await res.json();
                  console.log("Explicit Fetch Result:", JSON.stringify(json, null, 2));
                } catch (err) {
                   console.error("Fetch failed:", err);
                }
            }

            console.log("Last Refreshed:", data.lastRefreshedAt ? data.lastRefreshedAt.toDate() : "Never");
        } else {
            console.log("No Facebook Doc found for user.");
        }
    } catch (e) {
        console.error("Error reading firestore:", e);
    }
}
checkFacebookPages();
