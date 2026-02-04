
const { db } = require('./autopromote-functions/_server/src/firebaseAdmin');

const TARGET_UID = "bf04dPKELvVMivWoUyLsAVyw2sg2";

async function checkYoutubeScope() {
    console.log("Checking YouTube Connection Details...");
    const snap = await db.collection('users').doc(TARGET_UID).collection('connections').doc('youtube').get();
    if (snap.exists) {
        const data = snap.data();
        console.log("Scopes:", data.scope);
        console.log("Channel:", data.channel ? data.channel.id : "No Channel ID");
        console.log("Token Type:", data.token_type);
        console.log("Has Access Token:", !!data.encrypted_access_token);
    } else {
        console.log("No Youtube Doc found");
    }
}
checkYoutubeScope();
