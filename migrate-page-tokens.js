
require('dotenv').config();
const { db } = require('./src/firebaseAdmin');
const crypto = require("crypto");
const { encryptToken } = require('./src/services/secretVault');

const uid = 'bf04dPKELvVMivWoUyLsAVyw2sg2';
const OLD_KEY = "43ab7d8916b3898471ed17dbba4258c7";

function deriveKey(rawKey) {
  return crypto.createHash("sha256").update(rawKey).digest();
}

function decryptWithKey(stored, rawKey) {
  if (!stored) return null;
  const key = deriveKey(rawKey);
  try {
    const buf = Buffer.from(stored, "base64");
    if (buf.length < 29) return null; 
    const iv = buf.slice(0, 12);
    const tag = buf.slice(12, 28);
    const data = buf.slice(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString("utf8");
  } catch (e) {
    return null; // Fail silent
  }
}

async function migrate() {
    console.log("Reading Facebook Connection...");
    const ref = db.collection('users').doc(uid).collection('connections').doc('facebook');
    const doc = await ref.get();
    
    if (!doc.exists) {
        console.log("❌ No connection doc found!");
        return;
    }

    const data = doc.data();
    let updated = false;
    let newPages = [];

    if (data.pages && Array.isArray(data.pages)) {
        console.log(`Checking ${data.pages.length} pages...`);
        
        for (const p of data.pages) {
             let newPage = { ...p };
             if (p.encrypted_access_token) {
                 // Try decrypting with OLD KEY
                 const plaintext = decryptWithKey(p.encrypted_access_token, OLD_KEY);
                 
                 if (plaintext) {
                     console.log(`✅ Page ${p.name}: Decrypted with OLD KEY. Re-encrypting with Environment Key...`);
                     // Encrypt with CURRENT env key (via secretVault)
                     newPage.encrypted_access_token = encryptToken(plaintext);
                     updated = true;
                 } else {
                     console.log(`⚠️ Page ${p.name}: Could NOT decrypt with OLD KEY. Checking if valid with CURRENT key...`);
                     // Verify if it works with current key (maybe it's already migrated?)
                     try {
                        const { decryptToken: decryptCurrent } = require('./src/services/secretVault');
                        const check = decryptCurrent(p.encrypted_access_token);
                        if (check && check !== p.encrypted_access_token) {
                            console.log(`ℹ️ Page ${p.name}: Already valid with CURRENT key.`);
                        } else {
                            console.log(`❌ Page ${p.name}: Decryption failed with BOTH keys. Token lost.`);
                        }
                     } catch (e) { console.log(e.message); }
                 }
             }
             newPages.push(newPage);
        }
    }

    if (updated) {
        console.log("Writing updated pages to DB...");
        await ref.update({ pages: newPages });
        console.log("✅ Migration Complete.");
    } else {
        console.log("No changes needed.");
    }
}

migrate().catch(console.error);
