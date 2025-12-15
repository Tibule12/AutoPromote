const { admin, db } = require("./firebaseAdmin");
const https = require("https");

async function testHtmlContent() {
  try {
    // Get a recent landing page URL from Firebase Storage (not fake URLs)
    const contentQuery = db
      .collection("content")
      .where("landingPageUrl", ">=", "https://storage.googleapis.com")
      .where("landingPageUrl", "<", "https://storage.googleapis.com" + "\uf8ff")
      .limit(1);
    const snapshot = await contentQuery.get();

    if (snapshot.empty) {
      console.log("No Firebase Storage landing pages found to test HTML content");
      return;
    }

    const doc = snapshot.docs[0];
    const data = doc.data();
    const url = data.landingPageUrl;

    console.log(`Testing HTML content for: ${data.title}`);
    console.log(`URL: ${url}`);

    // Fetch the HTML content
    const html = await fetchHtml(url);
    console.log("HTML Content:");
    console.log(html);

    // Check for expected elements
    const hasTitle = html.includes(data.title);
    const hasVideo = data.type === "video" && html.includes("<video");
    const hasImage = data.type === "image" && html.includes("<img");
    const hasAudio = data.type === "audio" && html.includes("<audio");

    console.log("Validation:");
    console.log(`- Title present: ${hasTitle}`);
    console.log(`- Video embed: ${hasVideo}`);
    console.log(`- Image embed: ${hasImage}`);
    console.log(`- Audio embed: ${hasAudio}`);
  } catch (error) {
    console.error("Error testing HTML content:", error);
  }
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, res => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

testHtmlContent();
