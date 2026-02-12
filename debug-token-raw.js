
require('dotenv').config();
const { db } = require('./src/firebaseAdmin');
const { decryptToken } = require('./src/services/secretVault');

const uid = 'bf04dPKELvVMivWoUyLsAVyw2sg2';

async function checkToken() {
    console.log("Reading Facebook Connection...");
    const doc = await db.collection('users').doc(uid).collection('connections').doc('facebook').get();
    
    if (!doc.exists) {
        console.log("❌ No connection doc found!");
        return;
    }

    const data = doc.data();
    console.log("=== Metadata ===");
    console.log("Updated At:", data.updatedAt);
    console.log("Obtained At:", data.obtainedAt ? new Date(data.obtainedAt._seconds * 1000).toISOString() : "N/A");

    console.log("=== User Token ===");
    if (data.encrypted_user_access_token) {
        const plaintext = decryptToken(data.encrypted_user_access_token);
        if (plaintext === data.encrypted_user_access_token) {
             console.log("❌ User Token Decryption FAILED");
        } else {
             console.log("✅ User Token Decryption SUCCESS");
        }
    }

    console.log("=== Page Tokens ===");
    if (data.pages && Array.isArray(data.pages)) {
        data.pages.forEach((p, i) => {
            console.log(`Page ${i} (${p.encrypted_access_token ? "Encrypted" : "Plaintext"}):`);
            if (p.encrypted_access_token) {
                const pt = decryptToken(p.encrypted_access_token);
                if (pt === p.encrypted_access_token) {
                    console.log("  ❌ Decryption FAILED");
                } else {
                     console.log("  ✅ Decryption SUCCESS");
                }
            }
        });
    }
}

checkToken().catch(console.error);
