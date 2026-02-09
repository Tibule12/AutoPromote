
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
                data.pages.forEach((p, i) => {
                    console.log(`Page [${i}]: ${p.name} (ID: ${p.id})`);
                    console.log(`   - Instagram:`, p.instagram_business_account ? "YES" : "NO");
                });
            } else {
                console.log("Pages: ", data.pages);
            }

            console.log("Has Access Token:", !!(data.user_access_token || data.encrypted_user_access_token));
            console.log("Last Refreshed:", data.lastRefreshedAt ? data.lastRefreshedAt.toDate() : "Never");
        } else {
            console.log("No Facebook Doc found for user.");
        }
    } catch (e) {
        console.error("Error reading firestore:", e);
    }
}
checkFacebookPages();
