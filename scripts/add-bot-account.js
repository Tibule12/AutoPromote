const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin (using service account or default credentials)
// This assumes you have the service account configured in your environment or localized in src/firebaseAdmin.js
// If running locally, you might need to point to your service account key.

const serviceAccountPath = path.join(__dirname, '../service-account.json');
let serviceAccount;

try {
    if (fs.existsSync(serviceAccountPath)) {
        serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } else {
        // Fallback to default application credentials
        admin.initializeApp(); 
    }
} catch (e) {
    console.error("Failed to initialize Firebase Admin:", e);
    process.exit(1);
}

const db = admin.firestore();

async function addBotAccount() {
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
        console.log(`
Usage: node scripts/add-bot-account.js <platform> <username> <path-to-cookies.json>

Example:
  node scripts/add-bot-account.js tiktok my_bot_user ./cookies.json

  1. Install "EditThisCookie" extension in Chrome.
  2. Login to the account you want to use as a bot.
  3. Click extension -> "Export" (copies JSON to clipboard).
  4. Paste into a file named cookies.json.
  5. Run this script.
        `);
        process.exit(1);
    }

    const [platform, username, cookiePath] = args;

    if (!fs.existsSync(cookiePath)) {
        console.error(`Error: Cookie file not found at ${cookiePath}`);
        process.exit(1);
    }

    let cookies;
    try {
        const raw = fs.readFileSync(cookiePath, 'utf8');
        cookies = JSON.parse(raw);
        if (!Array.isArray(cookies)) {
            throw new Error("JSON is not an array of cookies.");
        }
    } catch (e) {
        console.error("Error parsing cookie JSON:", e.message);
        process.exit(1);
    }

    console.log(`Adding ${platform} account for user "${username}" with ${cookies.length} cookies...`);

    try {
        await db.collection('bot_accounts').add({
            platform: platform.toLowerCase(),
            username: username,
            cookies: cookies,
            status: 'active',
            createdAt: new Date(),
            lastUsed: new Date(0) // Never used
        });
        console.log("✅ Bot account added successfully!");
        console.log("This account will now be used by the 'Night Shift' bots.");
    } catch (e) {
        console.error("Database Error:", e);
    }
}

addBotAccount();
