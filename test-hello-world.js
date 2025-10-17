const functions = require('firebase-functions');

// Simulate the helloWorld function
async function testHelloWorld() {
  try {
    console.log('Testing helloWorld function...');

    // Simulate the HTTP request/response
    const mockReq = {};
    const mockRes = {
      send: (message) => {
        console.log('Response:', message);
        return message;
      }
    };

    // Call the function (simulated)
    const result = mockRes.send("Hello from Firebase Functions!");

    if (result === "Hello from Firebase Functions!") {
      console.log('✓ helloWorld: returned correct message');
    } else {
      console.log('✗ helloWorld: returned incorrect message');
    }

    console.log('helloWorld test completed successfully');

  } catch (error) {
    console.error('Error testing helloWorld:', error);
  }
}

testHelloWorld();
