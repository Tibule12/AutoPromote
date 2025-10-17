const { admin, db } = require('./firebaseAdmin');

async function testLandingPageIntent() {
  try {
    // Create a new content document with a unique ID to trigger the function
    const contentId = `test-content-${Date.now()}`;
    const contentRef = db.collection('content').doc(contentId);

    console.log(`Creating new test content document with ID: ${contentId}...`);
    await contentRef.set({
      title: 'Test Content',
      type: 'video',
      url: 'https://example.com/video.mp4',
      user_id: 'test-user-id',
      status: 'approved'
    });

    // Set landingPageRequestedAt to trigger the function
    console.log('Setting landingPageRequestedAt to trigger handleLandingPageIntent...');
    await contentRef.update({
      landingPageRequestedAt: admin.firestore.Timestamp.now()
    });

    console.log('Update successful. Check Cloud Functions logs for handleLandingPageIntent execution.');
  } catch (error) {
    console.error('Error in test:', error);
  }
}

testLandingPageIntent();
