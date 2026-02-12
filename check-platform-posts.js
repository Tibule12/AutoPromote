
const { db } = require('./src/firebaseAdmin');

async function check() {
  console.log("Checking 'platform_posts' collection...");
  try {
    const snap = await db.collection("platform_posts")
      .where("success", "==", true)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    console.log(`Found ${snap.size} documents.`);
    snap.forEach(d => {
      console.log(`- ${d.id}: platform=${d.data().platform} createdAt=${d.data().createdAt?.toDate()}`);
    });
  } catch (error) {
    console.error("Error querying platform_posts:", error);
    if (error.code === 9) { // FAILED_PRECONDITION often implies missing index
        console.error("POSSIBLE CAUSE: Missing Firestore Index.");
        console.error("Look for a URL in the error message above to create it.");
    }
  }
}

check();
