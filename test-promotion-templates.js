const { admin, db } = require('./firebaseAdmin');

async function testPromotionTemplates() {
  try {
    console.log('Testing Promotion Templates...');

    // Test createPromotionTemplate
    console.log('1. Testing createPromotionTemplate...');
    const templateData = {
      name: 'Test Template',
      caption: 'Amazing content you must see!',
      hashtags: ['#viral', '#content'],
      thumbnailStyle: 'bright',
      createdBy: 'test-user'
    };

    const templateRef = await db.collection('promotion_templates').add({
      ...templateData,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✓ createPromotionTemplate: template created with ID:', templateRef.id);

    // Test listPromotionTemplates
    console.log('2. Testing listPromotionTemplates...');
    const templatesSnapshot = await db.collection('promotion_templates').get();
    const templates = templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (templates.length > 0) {
      console.log('✓ listPromotionTemplates: found', templates.length, 'templates');
    } else {
      console.log('✗ listPromotionTemplates: no templates found');
    }

    // Create test content
    const contentId = `test-content-${Date.now()}`;
    await db.collection('content').doc(contentId).set({
      title: 'Test Content for Template',
      type: 'video',
      url: 'https://example.com/video.mp4',
      user_id: 'test-user-id',
      status: 'approved'
    });

    // Test attachTemplateToContent
    console.log('3. Testing attachTemplateToContent...');
    const templateDoc = await db.collection('promotion_templates').doc(templateRef.id).get();
    if (templateDoc.exists) {
      const templateData = templateDoc.data();
      await db.collection('content').doc(contentId).update({
        promotionTemplate: templateData,
        templateId: templateRef.id
      });

      // Verify template was attached
      const contentDoc = await db.collection('content').doc(contentId).get();
      if (contentDoc.data().promotionTemplate && contentDoc.data().templateId === templateRef.id) {
        console.log('✓ attachTemplateToContent: template attached successfully');
      } else {
        console.log('✗ attachTemplateToContent: template not attached');
      }
    } else {
      console.log('✗ attachTemplateToContent: template not found');
    }

    console.log('Promotion Templates tests completed successfully');

  } catch (error) {
    console.error('Error testing promotion templates:', error);
  }
}

testPromotionTemplates();
