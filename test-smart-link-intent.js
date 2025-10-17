const { admin, db } = require('./firebaseAdmin');
const { v4: uuidv4 } = require('uuid');

// Simulate the handleSmartLinkIntent function
async function simulateHandleSmartLinkIntent(change, context) {
  try {
    const before = change.before.exists ? (change.before.data() || {}) : {};
    const after = change.after.exists ? (change.after.data() || {}) : {};
    const contentId = context.params.contentId;

    console.log(`Simulating handleSmartLinkIntent for contentId: ${contentId}`);
    console.log('Before smartLinkRequestedAt:', before.smartLinkRequestedAt);
    console.log('After smartLinkRequestedAt:', after.smartLinkRequestedAt);

    // Guard: only proceed when intent is newly set and smartLink not present
    const beforeIntent = before.smartLinkRequestedAt;
    const afterIntent = after.smartLinkRequestedAt;
    const intentNewlySet = (!beforeIntent && !!afterIntent) || (beforeIntent === undefined && afterIntent !== undefined);

    console.log('Intent newly set:', intentNewlySet);

    if (!intentNewlySet) {
      console.log('SmartLinkIntent: intent not newly set, skipping.');
      return null;
    }

    if (after.smartLink) {
      console.log('SmartLinkIntent: smartLink already exists, skipping.');
      return null;
    }

    if (!after.landingPageUrl) {
      console.log('SmartLinkIntent: landingPageUrl missing, skipping.');
      return null;
    }

    const shortId = uuidv4().slice(0, 8);
    const redirectUrl = `${after.landingPageUrl}?source=autopromote&contentId=${encodeURIComponent(contentId)}&userId=${encodeURIComponent(after.user_id || '')}`;
    await admin.firestore().collection('smart_links').doc(shortId).set({
      contentId,
      userId: after.user_id || null,
      sourcePlatform: 'autopromote',
      redirectUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      clickCount: 0
    });
    const shortLink = `https://autopromote.page.link/${shortId}`;
    await change.after.ref.update({
      smartLink: shortLink,
      smartLinkGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Smart link generated for content ${contentId}: ${shortLink}`);
    return { shortLink, shortId };
  } catch (err) {
    console.error('Error in simulated handleSmartLinkIntent:', err);
    return null;
  }
}

async function testHandleSmartLinkIntent() {
  try {
    console.log('Testing handleSmartLinkIntent function...');

    // Create test content with landingPageUrl
    const contentId = `test-smart-link-${Date.now()}`;
    const contentRef = db.collection('content').doc(contentId);

    await contentRef.set({
      title: 'Test Content for Smart Link',
      type: 'video',
      url: 'https://example.com/video.mp4',
      user_id: 'test-user-id',
      status: 'approved',
      landingPageUrl: 'https://example.com/landing-page'
    });

    console.log('1. Created content with landingPageUrl');

    // Simulate setting smartLinkRequestedAt (this would trigger the function)
    await contentRef.update({
      smartLinkRequestedAt: admin.firestore.Timestamp.now()
    });

    console.log('2. Set smartLinkRequestedAt to trigger function');

    // Simulate the change object
    const beforeSnap = {
      exists: true,
      data: () => ({})
    };
    const afterSnap = {
      exists: true,
      data: () => ({
        title: 'Test Content for Smart Link',
        type: 'video',
        url: 'https://example.com/video.mp4',
        user_id: 'test-user-id',
        status: 'approved',
        landingPageUrl: 'https://example.com/landing-page',
        smartLinkRequestedAt: admin.firestore.Timestamp.now()
      }),
      ref: contentRef
    };
    const change = {
      before: beforeSnap,
      after: afterSnap
    };
    const context = { params: { contentId } };

    const result = await simulateHandleSmartLinkIntent(change, context);

    if (result && result.shortLink) {
      console.log('✓ handleSmartLinkIntent: smart link generated successfully');
      console.log('Generated short link:', result.shortLink);

      // Verify smart link was created in collection
      const smartLinkDoc = await db.collection('smart_links').doc(result.shortId).get();
      if (smartLinkDoc.exists) {
        console.log('✓ Smart link document created in collection');
        const smartLinkData = smartLinkDoc.data();
        console.log('Smart link data:', {
          contentId: smartLinkData.contentId,
          userId: smartLinkData.userId,
          sourcePlatform: smartLinkData.sourcePlatform,
          clickCount: smartLinkData.clickCount
        });
      } else {
        console.log('✗ Smart link document not found in collection');
      }

      // Verify smartLink field was updated in content
      const updatedContent = await contentRef.get();
      const contentData = updatedContent.data();
      if (contentData.smartLink === result.shortLink) {
        console.log('✓ Content document updated with smartLink field');
      } else {
        console.log('✗ Content document not updated with smartLink field');
      }

    } else {
      console.log('✗ handleSmartLinkIntent: smart link not generated');
    }

    // Test with existing smartLink (should skip)
    console.log('3. Testing with existing smartLink (should skip)...');

    const contentId2 = `test-existing-smart-link-${Date.now()}`;
    const contentRef2 = db.collection('content').doc(contentId2);

    await contentRef2.set({
      title: 'Test Content with Existing Smart Link',
      type: 'video',
      url: 'https://example.com/video2.mp4',
      user_id: 'test-user-id',
      status: 'approved',
      landingPageUrl: 'https://example.com/landing-page2',
      smartLink: 'https://autopromote.page.link/existing123'
    });

    await contentRef2.update({
      smartLinkRequestedAt: admin.firestore.Timestamp.now()
    });

    const beforeSnap2 = {
      exists: true,
      data: () => ({
        smartLink: 'https://autopromote.page.link/existing123'
      })
    };
    const afterSnap2 = {
      exists: true,
      data: () => ({
        title: 'Test Content with Existing Smart Link',
        type: 'video',
        url: 'https://example.com/video2.mp4',
        user_id: 'test-user-id',
        status: 'approved',
        landingPageUrl: 'https://example.com/landing-page2',
        smartLink: 'https://autopromote.page.link/existing123',
        smartLinkRequestedAt: admin.firestore.Timestamp.now()
      }),
      ref: contentRef2
    };
    const change2 = {
      before: beforeSnap2,
      after: afterSnap2
    };
    const context2 = { params: { contentId: contentId2 } };

    const result2 = await simulateHandleSmartLinkIntent(change2, context2);

    if (!result2) {
      console.log('✓ handleSmartLinkIntent correctly skipped when smartLink already exists');
    } else {
      console.log('✗ handleSmartLinkIntent incorrectly generated link when one already exists');
    }

    console.log('handleSmartLinkIntent tests completed successfully');

  } catch (error) {
    console.error('Error testing handleSmartLinkIntent:', error);
  }
}

testHandleSmartLinkIntent();
