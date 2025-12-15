const { admin, db } = require("./firebaseAdmin");

async function checkLandingPageResult() {
  try {
    // Query for content documents that have landingPageUrl set
    const contentQuery = db.collection("content").where("landingPageUrl", "!=", null).limit(5);
    const snapshot = await contentQuery.get();

    if (snapshot.empty) {
      console.log("No content documents found with landingPageUrl.");
      return;
    }

    console.log("Found content documents with landingPageUrl:");
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`ID: ${doc.id}, Title: ${data.title}, URL: ${data.landingPageUrl}`);
    });
  } catch (error) {
    console.error("Error checking landing page result:", error);
  }
}

checkLandingPageResult();
