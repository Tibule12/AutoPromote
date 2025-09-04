// fix-cors.js
// Script to update the CORS configuration in server.js

const fs = require('fs');
const path = require('path');

const serverFilePath = path.join(__dirname, 'server.js');

// Read the server.js file
fs.readFile(serverFilePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading server.js:', err);
    return;
  }

  // Find the CORS configuration section
  const corsSection = data.match(/const corsOptions = \{[\s\S]*?\};/);
  
  if (!corsSection) {
    console.error('Could not find CORS configuration section in server.js');
    return;
  }

  // Updated CORS configuration
  const updatedCorsOptions = `const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin'],
  preflightContinue: false,
  optionsSuccessStatus: 204
};`;

  // Replace the old CORS configuration with the updated one
  const updatedServerJs = data.replace(corsSection[0], updatedCorsOptions);

  // Write the updated content back to server.js
  fs.writeFile(serverFilePath, updatedServerJs, 'utf8', (writeErr) => {
    if (writeErr) {
      console.error('Error writing to server.js:', writeErr);
      return;
    }
    console.log('✅ Updated CORS configuration in server.js');
  });
});
