const { validateContentData, sanitizeInput } = require('./validationMiddleware');

// Mock request and response objects
const mockReq = {
  body: {
    title: 'Test Video',
    type: 'video',
    url: 'https://example.com/test.mp4',
    description: 'Test description'
  }
};

const mockRes = {
  status: (code) => ({
    json: (data) => {
      console.log(`Response ${code}:`, JSON.stringify(data, null, 2));
      return mockRes;
    }
  })
};

const mockNext = () => {
  console.log('Validation passed! Proceeding to next middleware.');
};

// Test the validation
console.log('Testing validation with payload:', JSON.stringify(mockReq.body, null, 2));
console.log('');

// First sanitize
sanitizeInput(mockReq, mockRes, () => {
  console.log('After sanitization:', JSON.stringify(mockReq.body, null, 2));
  console.log('');

  // Then validate
  validateContentData(mockReq, mockRes, mockNext);
});
