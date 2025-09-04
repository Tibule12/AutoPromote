const http = require('http');

// Test user credentials
const TEST_EMAIL = 'tmtshwelo21@gmail.com';
const TEST_PASSWORD = 'Test123!';

async function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ status: res.statusCode, data: response });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testContentUploadWithDebug() {
  console.log('🔍 Testing Content Upload with Detailed Logging...\n');

  try {
    // Step 1: Login to get JWT token
    console.log('1. 🔐 Logging in to get JWT token...');
    const loginOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const loginData = {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    };

    const loginResponse = await makeRequest(loginOptions, loginData);

    if (loginResponse.status !== 200) {
      console.log('❌ Login failed:', loginResponse.data);
      return;
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful! JWT token obtained\n');

    // Step 2: Upload content with detailed logging
    console.log('2. 📤 Uploading content with debug logging...');
    const uploadOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/content/upload',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    const contentData = {
      title: 'Debug Test Content - ' + new Date().toISOString(),
      type: 'article',
      url: 'https://example.com/debug-test-' + Date.now(),
      description: 'This is a debug test content to check Firestore logging',
      target_platforms: ['youtube', 'tiktok'],
      scheduled_promotion_time: null,
      promotion_frequency: 'once',
      target_rpm: 100000,
      min_views_threshold: 50000,
      max_budget: 200
    };

    console.log('📝 Content data being sent:', JSON.stringify(contentData, null, 2));

    const uploadResponse = await makeRequest(uploadOptions, contentData);

    console.log('\n📊 Upload Response:');
    console.log('Status:', uploadResponse.status);
    console.log('Response:', JSON.stringify(uploadResponse.data, null, 2));

    if (uploadResponse.status === 201) {
      console.log('\n🎉 SUCCESS! Content uploaded successfully!');
      console.log('Content ID:', uploadResponse.data.content?.id || 'Check response above');
    } else {
      console.log('\n❌ Upload failed!');
      console.log('Error details:', uploadResponse.data);
    }

    // Step 3: Fetch user's content to verify
    console.log('\n3. 📋 Fetching user content to verify...');
    const fetchOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/content/my-content',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    const fetchResponse = await makeRequest(fetchOptions);

    console.log('\n📊 Fetch Response:');
    console.log('Status:', fetchResponse.status);
    if (fetchResponse.status === 200) {
      console.log('✅ Content retrieved successfully!');
      console.log('Number of content items:', fetchResponse.data.content?.length || 0);
      if (fetchResponse.data.content && fetchResponse.data.content.length > 0) {
        console.log('Latest content:', JSON.stringify(fetchResponse.data.content[0], null, 2));
      }
    } else {
      console.log('❌ Fetch failed:', fetchResponse.data);
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testContentUploadWithDebug();
