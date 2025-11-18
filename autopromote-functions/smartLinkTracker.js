const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const { v4: uuidv4 } = require('./lib/uuid-compat');

const region = 'us-central1';

// Smart Link Tracker
exports.generateSmartLink = functions.region(region).https.onCall(async (data, context) => {
  // data: { contentId, userId, sourcePlatform }
  const { contentId, userId, sourcePlatform } = data;
  if (!contentId || !userId || !sourcePlatform) {
    throw new functions.https.HttpsError('invalid-argument', 'contentId, userId, and sourcePlatform are required');
  }
  try {
    // Generate a short link ID
    const shortId = uuidv4().slice(0, 8);
    // Compose UTM parameters
    const utm = `?source=${encodeURIComponent(sourcePlatform)}&contentId=${encodeURIComponent(contentId)}&userId=${encodeURIComponent(userId)}`;
    // The smart link will redirect to the landing page (assume stored in content doc)
    const contentDoc = await admin.firestore().collection('content').doc(contentId).get();
    if (!contentDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Content not found');
    }
    const landingPageUrl = contentDoc.data().landingPageUrl;
    if (!landingPageUrl) {
      throw new functions.https.HttpsError('failed-precondition', 'Landing page URL not set for content');
    }
    const redirectUrl = `${landingPageUrl}${utm}`;
    // Store the short link mapping in Firestore
    await admin.firestore().collection('smart_links').doc(shortId).set({
      contentId,
      userId,
      sourcePlatform,
      redirectUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      clickCount: 0
    });
    // Return the short link (assume a domain like https://autopromote.page.link/)
    const shortLink = `https://autopromote.page.link/${shortId}`;
    return { shortLink };
  } catch (error) {
    console.error('Error generating smart link:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Redirect handler and click logger
exports.smartLinkRedirect = functions.region(region).https.onRequest(async (req, res) => {
  // URL: /smart-link/:shortId
  const shortId = req.path.split('/').pop();
  if (!shortId) {
    return res.status(400).send('Missing short link ID');
  }
  try {
    const doc = await admin.firestore().collection('smart_links').doc(shortId).get();
    if (!doc.exists) {
      return res.status(404).send('Short link not found');
    }
    const data = doc.data();
    // Log the click in analytics
    await admin.firestore().collection('analytics').add({
      type: 'smart_link_click',
      contentId: data.contentId,
      userId: data.userId,
      sourcePlatform: data.sourcePlatform,
      shortId,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress
    });
    // Increment click count
    await admin.firestore().collection('smart_links').doc(shortId).update({
      clickCount: admin.firestore.FieldValue.increment(1)
    });
    // Redirect to the actual landing page with UTM params
    return res.redirect(data.redirectUrl);
  } catch (error) {
    console.error('Error handling smart link redirect:', error);
    return res.status(500).send('Internal server error');
  }
});
