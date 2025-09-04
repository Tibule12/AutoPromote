const express = require('express');
const { validateContentData, sanitizeInput } = require('./validationMiddleware');

const app = express();
app.use(express.json());

// Test endpoint that mimics the content upload
app.post('/test-validation', sanitizeInput, validateContentData, (req, res) => {
  res.json({ message: 'Validation passed', body: req.body });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log('Test the validation with:');
  console.log('curl -X POST http://localhost:3001/test-validation -H "Content-Type: application/json" -d \'{"title":"Test","type":"video","url":"https://example.com"}\'');
});
