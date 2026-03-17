require("dotenv").config();
const { db } = require("./src/firebaseAdmin");
const fetch = require("node-fetch");

async function main() {
  console.log("🔍 INSPECTING FACEBOOK TOKENS FOR ALL USERS...");
  
  const usersSnap = await db.collection("users").get();
  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const fbDoc = await db.collection("users").doc(uid).collection("connections").doc("facebook").get();
    
    if (!fbDoc.exists) continue;
    
    const data = fbDoc.data();
    console.log(`\n👤 User: ${uid}`);
    
    const pages = data.meta?.pages || [];
    if (pages.length === 0) {
      console.log("   ❌ No Pages linked.");
      continue;
    }

    // Check first page token
    const page = pages[0];
    const token = page.access_token;
    
    if (!token) {
      console.log("   ❌ Page has no token.");
      continue;
    }

    console.log(`   📄 Page: ${page.name} (ID: ${page.id})`);
    console.log("   🔑 Checking Token Permissions...");

    try {
      const res = await fetch(`https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`);
      const json = await res.json();
      
      if (json.data) {
        console.log(`      Valid: ${json.data.is_valid}`);
        console.log(`      Expires: ${new Date(json.data.expires_at * 1000).toISOString()}`);
        console.log(`      Scopes: ${JSON.stringify(json.data.scopes)}`);
        
        const hasScope = (json.data.scopes || []).includes("pages_read_engagement");
        if (hasScope) {
          console.log("      ✅ HAS 'pages_read_engagement' scope!");
        } else {
          console.log("      ❌ MISSING 'pages_read_engagement' scope.");
        }
      } else {
        console.log("      ❌ Could not debug token:", JSON.stringify(json));
      }
    } catch (e) {
      console.log("      🔥 Error checking token:", e.message);
    }
  }
}

main();