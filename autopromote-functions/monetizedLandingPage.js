const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("./lib/uuid-compat");

const region = "us-central1";

// Monetized Landing Page Generator
exports.generateMonetizedLandingPage = functions
  .region(region)
  .https.onCall(async (data, context) => {
    // data: { contentId, userId }
    const { contentId, userId } = data;
    if (!contentId || !userId) {
      throw new functions.https.HttpsError("invalid-argument", "contentId and userId are required");
    }
    try {
      // Fetch content metadata from Firestore
      const contentDoc = await admin.firestore().collection("content").doc(contentId).get();
      if (!contentDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Content not found");
      }
      const content = contentDoc.data();
      // Generate a unique landing page ID
      const landingPageId = uuidv4();
      // Compose landing page HTML
      const landingPageHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${content.title || "Promoted Content"}</title>
      </head>
      <body>
        <h1>${content.title || "Promoted Content"}</h1>
        <div id="content-embed">
          ${content.type === "video" ? `<video src="${content.url}" controls style="max-width:100%"></video>` : ""}
          ${content.type === "image" ? `<img src="${content.url}" alt="${content.title}" style="max-width:100%"/>` : ""}
          ${content.type === "audio" ? `<audio src="${content.url}" controls></audio>` : ""}
        </div>
      </body>
      </html>
    `;
      // Store landing page HTML in Firebase Storage
      const bucket = admin.storage().bucket("autopromote-cc6d3.firebasestorage.app");
      const file = bucket.file(`landing-pages/${landingPageId}.html`);
      const { saveFileSafely } = require('../src/utils/storageGuard');
      await saveFileSafely(file, landingPageHtml, { contentType: "text/html" });
      // Generate a signed URL for the landing page
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 1000 * 60 * 60 * 24 * 30,
      }); // 30 days
      // Store the landing page URL in Firestore
      await admin.firestore().collection("content").doc(contentId).update({ landingPageUrl: url });
      // Optionally, store in a separate collection for analytics
      await admin.firestore().collection("promotions").add({
        contentId,
        userId,
        landingPageUrl: url,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        type: "landing_page",
      });
      return { landingPageUrl: url };
    } catch (error) {
      console.error("Error generating landing page:", error);
      throw new functions.https.HttpsError("internal", error.message);
    }
  });
