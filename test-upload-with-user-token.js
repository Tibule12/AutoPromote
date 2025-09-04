const http = require('http');

// Your Firebase ID token
const ID_TOKEN = 'eyJhbGciOiJSUzI1NiIsImtpZCI6ImVmMjQ4ZjQyZjc0YWUwZjk0OTIwYWY5YTlhMDEzMTdlZjJkMzVmZTEiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiVGh1bGFuaSBNdHNod2VsbyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9hdXRvcHJvbW90ZS00NjRkZSIsImF1ZCI6ImF1dG9wcm9tb3RlLTQ2NGRlIiwiYXV0aF90aW1lIjoxNzU2OTAyNTU5LCJ1c2VyX2lkIjoiUUtIRHJWRGkyQVdoUzdRYnU4ZkhUa2xlV0hGMyIsInN1YiI6IlFLSERyVkRpMkFXaFM3UWJ1OGZIVGtsZVdIRjMiLCJpYXQiOjE3NTY5MDI1NjEsImV4cCI6MTc1NjkwNjE2MSwiZW1haWwiOiJ0bXRzaHdlbG8yMUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6ZmFsc2UsImZpcmViYXNlIjp7ImlkZW50aXRpZXMiOnsiZW1haWwiOlsidG10c2h3ZWxvMjFAZ21haWwuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoicGFzc3dvcmQifX0.bBbqL6P_KdDmCAm4t2wV1qhAX_TKem6Ub_OrZCT3dCLOXlLPLr1KGpD19KfHxArqmqfE1jFIuZYF_AJWk0TBW9MIXagiNYxwh8B5nftYZ4SI_1VRP_8oY9Q5tJlJa1yMUlDLWOe77x_EmLNisQwEi384DhmCJfAN4mPorI0TFbOJgJeyPRmAvFGbMlRgDb_0B8qroOQRMGwTN1_a-kLsm8j-7N40JeP0DqhHsZTOZPvjowZxBxuafFw4-6tqz4KI6CyPqEbotvJU2PrNJ3yGpFbl2KKwLNo7VARZ7NF4xUCjdNlQzSxSQq6N585AyWMU2sw2ntR_0eIlzjNYxrPUbg';

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

async function testContentUpload() {
  console.log('🔍 Testing Content Upload with Enhanced Logging...\n');

  try {
    // Step 1: Verify token with backend
    console.log('1. 🔐 Verifying Firebase ID token with backend...');
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
      idToken: ID_TOKEN
    };

    const loginResponse = await makeRequest(loginOptions, loginData);

    if (loginResponse.status !== 200) {
      console.log('❌ Backend login failed:', loginResponse.data);
      return;
    }

    console.log('✅ Backend login successful!');
    console.log('User:', loginResponse.data.user.email);
    console.log('Role:', loginResponse.data.user.role);
    console.log('Is Admin:', loginResponse.data.user.isAdmin);
    console.log('');

    // Step 2: Upload content with enhanced logging
    console.log('2. 📤 Uploading content (check server logs for detailed Firestore logging)...');
    const uploadOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/content/upload',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ID_TOKEN}`
      }
    };

    const timestamp = Date.now();
    const contentData = {
      title: `Debug Test Content - ${timestamp}`,
      type: 'article',
      url: `https://example.com/debug-test-${timestamp}`,
      description: 'This is a debug test content to check Firestore logging with enhanced logging',
      target_platforms: ['youtube', 'tiktok'],
      scheduled_promotion_time: null,
      promotion_frequency: 'once',
      target_rpm: 100000,
      min_views_threshold: 50000,
      max_budget: 200
    };

    console.log('📝 Content data being sent:');
    console.log(JSON.stringify(contentData, null, 2));
    console.log('');

    const uploadResponse = await makeRequest(uploadOptions, contentData);

    console.log('📊 Upload Response:');
    console.log('Status:', uploadResponse.status);
    console.log('Response:', JSON.stringify(uploadResponse.data, null, 2));

    if (uploadResponse.status === 201) {
      console.log('\n🎉 SUCCESS! Content uploaded successfully!');
      console.log('Content ID:', uploadResponse.data.content?.id || 'Check response above');
      console.log('\n🔍 Check your server console for detailed Firestore logging:');
      console.log('- Content upload request received');
      console.log('- Preparing to save content to Firestore');
      console.log('- Content data to save (JSON)');
      console.log('- Firestore document ID');
      console.log('- ✅ Content successfully saved to Firestore');
      console.log('- ✅ Upload process completed successfully');
    } else {
      console.log('\n❌ Upload failed!');
      console.log('Error details:', uploadResponse.data);
      console.log('\n🔍 Check server logs for detailed error information');
    }

    // Step 3: Fetch user's content to verify
    console.log('\n3. 📋 Fetching user content to verify...');
    const fetchOptions = {
      hostname: 'localhost',
      port: 5000,
      path: '/api/content/my-content',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ID_TOKEN}`
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
testContentUpload();
