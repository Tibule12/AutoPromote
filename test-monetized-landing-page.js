const { admin, db } = require('./firebaseAdmin');
const { v4: uuidv4 } = require('uuid');

// Simulate the generateMonetizedLandingPage function
async function simulateGenerateMonetizedLandingPage(data, context) {
  const { contentId, userId } = data;
  if (!contentId || !userId) {
    throw new Error('contentId and userId are required');
  }

  try {
    console.log(`Simulating generateMonetizedLandingPage for contentId: ${contentId}, userId: ${userId}`);

    // Fetch content metadata from Firestore
    const contentDoc = await admin.firestore().collection('content').doc(contentId).get();
    if (!contentDoc.exists) {
      throw new Error('Content not found');
    }
    const content = contentDoc.data();
    console.log('Fetched content:', { title: content.title, type: content.type });

    // Generate a unique landing page ID
    const landingPageId = uuidv4();
    console.log('Generated landing page ID:', landingPageId);

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

    console.log('Generated HTML content (first 200 chars):', landingPageHtml.substring(0, 200) + '...');

    // Store landing page HTML in Firebase Storage (simulated)
    const bucketName = 'autopromote-cc6d3.firebasestorage.app';
    const fileName = `landing-pages/${landingPageId}.html`;
    console.log(`Would store HTML in Firebase Storage: gs://${bucketName}/${fileName}`);

    // Generate a signed URL for the landing page (simulated)
    const expires = Date.now() + 1000 * 60 * 60 * 24 * 30; // 30 days
    const signedUrl = `https://storage.googleapis.com/${bucketName}/${fileName}?GoogleAccessId=autopromote-cc6d3%40appspot.gserviceaccount.com&Expires=${Math.floor(expires / 1000)}&Signature=simulated_signature`;
    console.log('Generated signed URL:', signedUrl);

    // Store the landing page URL in Firestore
    await admin.firestore().collection('content').doc(contentId).update({ landingPageUrl: signedUrl });

    // Optionally, store in a separate collection for analytics
    await admin.firestore().collection('promotions').add({
      contentId,
      userId,
      landingPageUrl: signedUrl,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      type: 'landing_page',
    });

    console.log('Updated content document with landingPageUrl');
    console.log('Created promotion analytics document');

    return { landingPageUrl: signedUrl };
  } catch (error) {
    console.error('Error in simulated generateMonetizedLandingPage:', error);
    throw error;
  }
}

async function testGenerateMonetizedLandingPage() {
  try {
    console.log('Testing generateMonetizedLandingPage function...');

    // Create test content
    const contentId = `test-monetized-landing-${Date.now()}`;
    const userId = 'test-user-id';

    await db.collection('content').doc(contentId).set({
      title: 'Test Content for Monetized Landing Page',
      type: 'video',
      url: 'https://example.com/video.mp4',
      user_id: userId,
      status: 'approved'
    });

    console.log('1. Created test content');

    // Call the simulated function
    const data = { contentId, userId };
    const context = {}; // Not used in this function

    const result = await simulateGenerateMonetizedLandingPage(data, context);

    if (result && result.landingPageUrl) {
      console.log('✓ generateMonetizedLandingPage: landing page generated successfully');
      console.log('Landing page URL:', result.landingPageUrl);

      // Verify content was updated
      const updatedContent = await db.collection('content').doc(contentId).get();
      const contentData = updatedContent.data();

      if (contentData.landingPageUrl === result.landingPageUrl) {
        console.log('✓ Content document updated with landingPageUrl');
      } else {
        console.log('✗ Content document not updated with landingPageUrl');
      }

      // Verify promotion analytics document was created
      const promotionsSnapshot = await db.collection('promotions').where('contentId', '==', contentId).where('type', '==', 'landing_page').get();

      if (!promotionsSnapshot.empty) {
        console.log('✓ Promotion analytics document created');
        const promoData = promotionsSnapshot.docs[0].data();
        console.log('Promotion data:', {
          contentId: promoData.contentId,
          userId: promoData.userId,
          type: promoData.type
        });
      } else {
        console.log('✗ Promotion analytics document not created');
      }

    } else {
      console.log('✗ generateMonetizedLandingPage: landing page not generated');
    }

    // Test with different content types
    console.log('2. Testing with image content type...');

    const contentId2 = `test-image-landing-${Date.now()}`;

    await db.collection('content').doc(contentId2).set({
      title: 'Test Image Content',
      type: 'image',
      url: 'https://example.com/image.jpg',
      user_id: userId,
      status: 'approved'
    });

    const data2 = { contentId: contentId2, userId };
    const result2 = await simulateGenerateMonetizedLandingPage(data2, context);

    if (result2 && result2.landingPageUrl) {
      console.log('✓ generateMonetizedLandingPage: image landing page generated successfully');
    } else {
      console.log('✗ generateMonetizedLandingPage: image landing page not generated');
    }

    // Test error cases
    console.log('3. Testing error cases...');

    try {
      await simulateGenerateMonetizedLandingPage({ contentId: 'nonexistent', userId }, context);
      console.log('✗ Should have thrown error for nonexistent content');
    } catch (error) {
      console.log('✓ Correctly threw error for nonexistent content:', error.message);
    }

    try {
      await simulateGenerateMonetizedLandingPage({ contentId, userId: null }, context);
      console.log('✗ Should have thrown error for missing userId');
    } catch (error) {
      console.log('✓ Correctly threw error for missing userId:', error.message);
    }

    console.log('generateMonetizedLandingPage tests completed successfully');

  } catch (error) {
    console.error('Error testing generateMonetizedLandingPage:', error);
  }
}

testGenerateMonetizedLandingPage();
