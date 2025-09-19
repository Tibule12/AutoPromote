const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const region = 'us-central1';

// Promotion Templates: CRUD and attach to content
exports.createPromotionTemplate = functions.region(region).https.onCall(async (data, context) => {
  // data: { name, caption, hashtags, thumbnailStyle, createdBy }
  const { name, caption, hashtags, thumbnailStyle, createdBy } = data;
  if (!name || !caption) {
    throw new functions.https.HttpsError('invalid-argument', 'name and caption are required');
  }
  try {
    const docRef = await admin.firestore().collection('promotion_templates').add({
      name,
      caption,
      hashtags: hashtags || [],
      thumbnailStyle: thumbnailStyle || null,
      createdBy: createdBy || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { id: docRef.id };
  } catch (error) {
    console.error('Error creating promotion template:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.listPromotionTemplates = functions.region(region).https.onCall(async (data, context) => {
  try {
    const snapshot = await admin.firestore().collection('promotion_templates').get();
    const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return { templates };
  } catch (error) {
    console.error('Error listing promotion templates:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

exports.attachTemplateToContent = functions.region(region).https.onCall(async (data, context) => {
  // data: { contentId, templateId }
  const { contentId, templateId } = data;
  if (!contentId || !templateId) {
    throw new functions.https.HttpsError('invalid-argument', 'contentId and templateId are required');
  }
  try {
    const templateDoc = await admin.firestore().collection('promotion_templates').doc(templateId).get();
    if (!templateDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Template not found');
    }
    const templateData = templateDoc.data();
    await admin.firestore().collection('content').doc(contentId).update({
      promotionTemplate: templateData,
      templateId
    });
    return { success: true };
  } catch (error) {
    console.error('Error attaching template to content:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});
