const { db, auth, admin } = require('./firebaseAdmin');
const {
  validateContentData,
  validateUserData,
  validateAnalyticsData,
  validatePromotionData,
  sanitizeInput
} = require('./validationMiddleware');

async function testValidationMiddleware() {
  try {
    console.log('🔍 Testing Validation Middleware...\n');

    // Mock request/response objects for testing
    const createMockReq = (body) => ({ body });
    const createMockRes = () => {
      const res = {};
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.responseData = data;
        return res;
      };
      return res;
    };

    // Test 1: Valid content data
    console.log('1. Testing valid content data:');
    const validReq = createMockReq({
      title: 'Test Article',
      type: 'article',
      url: 'https://example.com/test',
      description: 'Test description',
      target_platforms: ['youtube', 'tiktok'],
      scheduled_promotion_time: new Date(Date.now() + 86400000).toISOString(),
      promotion_frequency: 'daily',
      target_rpm: 1000,
      min_views_threshold: 10000,
      max_budget: 500
    });

    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const validRes = createMockRes();

    await validateContentData(validReq, validRes, next);

    if (nextCalled) {
      console.log('   ✅ Valid content data passed validation');
    } else {
      console.log('   ❌ Valid content data failed validation:', validRes.responseData);
    }

    // Test 2: Invalid content data - missing required fields
    console.log('\n2. Testing invalid content data (missing fields):');
    const invalidReq1 = createMockReq({
      // Missing title, type, url
      description: 'Test description'
    });

    nextCalled = false;
    const invalidRes1 = createMockRes();

    await validateContentData(invalidReq1, invalidRes1, next);

    if (!nextCalled && invalidRes1.responseData?.error === 'Validation failed') {
      console.log('   ✅ Invalid content data properly rejected');
      console.log('   Validation errors:', invalidRes1.responseData.details.length);
    } else {
      console.log('   ❌ Invalid content data was not rejected');
    }

    // Test 3: Invalid content data - wrong types
    console.log('\n3. Testing invalid content data (wrong types):');
    const invalidReq2 = createMockReq({
      title: null, // Should be string
      type: 'article',
      url: 'https://example.com/test',
      target_rpm: 'not-a-number', // Should be number
      max_budget: -100 // Should be non-negative
    });

    nextCalled = false;
    const invalidRes2 = createMockRes();

    await validateContentData(invalidReq2, invalidRes2, next);

    if (!nextCalled && invalidRes2.responseData?.error === 'Validation failed') {
      console.log('   ✅ Invalid data types properly rejected');
      console.log('   Validation errors:', invalidRes2.responseData.details.length);
    } else {
      console.log('   ❌ Invalid data types were not rejected');
    }

    // Test 4: Invalid URL
    console.log('\n4. Testing invalid URL:');
    const invalidReq3 = createMockReq({
      title: 'Test Article',
      type: 'article',
      url: 'not-a-valid-url'
    });

    nextCalled = false;
    const invalidRes3 = createMockRes();

    await validateContentData(invalidReq3, invalidRes3, next);

    if (!nextCalled && invalidRes3.responseData?.error === 'Validation failed') {
      console.log('   ✅ Invalid URL properly rejected');
    } else {
      console.log('   ❌ Invalid URL was not rejected');
    }

    // Test 5: Invalid content type
    console.log('\n5. Testing invalid content type:');
    const invalidReq4 = createMockReq({
      title: 'Test Article',
      type: 'invalid-type',
      url: 'https://example.com/test'
    });

    nextCalled = false;
    const invalidRes4 = createMockRes();

    await validateContentData(invalidReq4, invalidRes4, next);

    if (!nextCalled && invalidRes4.responseData?.error === 'Validation failed') {
      console.log('   ✅ Invalid content type properly rejected');
    } else {
      console.log('   ❌ Invalid content type was not rejected');
    }

    // Test 6: Invalid platform
    console.log('\n6. Testing invalid platform:');
    const invalidReq5 = createMockReq({
      title: 'Test Article',
      type: 'article',
      url: 'https://example.com/test',
      target_platforms: ['invalid-platform']
    });

    nextCalled = false;
    const invalidRes5 = createMockRes();

    await validateContentData(invalidReq5, invalidRes5, next);

    if (!nextCalled && invalidRes5.responseData?.error === 'Validation failed') {
      console.log('   ✅ Invalid platform properly rejected');
    } else {
      console.log('   ❌ Invalid platform was not rejected');
    }

    // Test 7: Past scheduled time
    console.log('\n7. Testing past scheduled time:');
    const invalidReq6 = createMockReq({
      title: 'Test Article',
      type: 'article',
      url: 'https://example.com/test',
      scheduled_promotion_time: new Date(Date.now() - 86400000).toISOString() // Yesterday
    });

    nextCalled = false;
    const invalidRes6 = createMockRes();

    await validateContentData(invalidReq6, invalidRes6, next);

    if (!nextCalled && invalidRes6.responseData?.error === 'Validation failed') {
      console.log('   ✅ Past scheduled time properly rejected');
    } else {
      console.log('   ❌ Past scheduled time was not rejected');
    }

    // Test 8: Sanitization
    console.log('\n8. Testing input sanitization:');
    const unsanitizedReq = createMockReq({
      title: '  Test Article  ',
      type: 'article',
      url: 'https://example.com/test',
      description: '  Test description  '
    });

    const sanitizedRes = createMockRes();
    let sanitizeNextCalled = false;
    const sanitizeNext = () => { sanitizeNextCalled = true; };

    await sanitizeInput(unsanitizedReq, sanitizedRes, sanitizeNext);

    if (sanitizeNextCalled) {
      console.log('   ✅ Input sanitization completed');
      console.log('   Original title:', '"  Test Article  "');
      console.log('   Sanitized title:', `"${unsanitizedReq.body.title}"`);
      console.log('   Trimmed:', unsanitizedReq.body.title === 'Test Article');
    } else {
      console.log('   ❌ Input sanitization failed');
    }

    console.log('\n🎉 Validation middleware testing completed!');
    console.log('📋 Summary:');
    console.log('   - Valid data acceptance: Tested');
    console.log('   - Required field validation: Tested');
    console.log('   - Data type validation: Tested');
    console.log('   - URL format validation: Tested');
    console.log('   - Content type validation: Tested');
    console.log('   - Platform validation: Tested');
    console.log('   - Date validation: Tested');
    console.log('   - Input sanitization: Tested');

  } catch (error) {
    console.error('❌ Validation middleware test failed:', error.message);
  } finally {
    process.exit(0);
  }
}

testValidationMiddleware();
