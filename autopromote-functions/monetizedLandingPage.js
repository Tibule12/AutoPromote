
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { v4: uuidv4 } = require('uuid');

const region = 'us-central1';

// Monetized Landing Page Generator
exports.generateMonetizedLandingPage = functions.region(region).https.onCall(async (data, context) => {
  // data: { contentId, userId }
  const { contentId, userId } = data;
  if (!contentId || !userId) {
    throw new functions.https.HttpsError('invalid-argument', 'contentId and userId are required');
  }
  try {
    // Fetch content metadata from Firestore
    const contentDoc = await admin.firestore().collection('content').doc(contentId).get();
    if (!contentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Content not found');
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
        <title>${content.title || 'Promoted Content'}</title>
        <!-- Google AdSense -->
        <script data-ad-client="ca-pub-xxxxxxxxxxxxxxxx" async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
      </head>
      <body>
        <h1>${content.title || 'Promoted Content'}</h1>
        <div id="content-embed">
          ${content.type === 'video' ? `<video src="${content.url}" controls style="max-width:100%"></video>` : ''}
          ${content.type === 'image' ? `<img src="${content.url}" alt="${content.title}" style="max-width:100%"/>` : ''}
          ${content.type === 'audio' ? `<audio src="${content.url}" controls></audio>` : ''}
        </div>
        <!-- Monetization: AdSense -->
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="ca-pub-xxxxxxxxxxxxxxxx"
             data-ad-slot="1234567890"
             data-ad-format="auto"></ins>
        <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
        <!-- Affiliate Links -->
        <div id="affiliate-links">
          <a href="https://affiliate.example.com/product1?ref=${userId}" target="_blank">Buy Product 1</a>
        </div>
      </body>
      </html>
    `;
    // Store landing page HTML in Firebase Storage
  const bucket = admin.storage().bucket('autopromote-cc6d3.firebasestorage.app');
    const file = bucket.file(`landing-pages/${landingPageId}.html`);
    await file.save(landingPageHtml, { contentType: 'text/html' });
    // Generate a signed URL for the landing page
    const [url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 * 24 * 30 }); // 30 days
    // Store the landing page URL in Firestore
    await admin.firestore().collection('content').doc(contentId).update({ landingPageUrl: url });
    // Optionally, store in a separate collection for analytics
    await admin.firestore().collection('promotions').add({
      contentId,
      userId,
      landingPageUrl: url,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'landing_page',
    });
    return { landingPageUrl: url };
  } catch (error) {
    console.error('Error generating landing page:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
