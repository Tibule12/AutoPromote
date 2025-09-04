// restart-server.js
const { spawn } = require('child_process');
const http = require('http');

// Function to check if server is already running
function checkIfServerRunning(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/api/health`, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('Server is already running on port', port);
          console.log('Health check response:', response);
          resolve(true);
        } catch (e) {
          console.log('Received response but couldn\'t parse JSON');
          resolve(true); // Still consider server as running
        }
      });
    });
    
    req.on('error', () => {
      console.log('Server is not running on port', port);
      resolve(false);
    });
    
    req.end();
  });
}

// Start server only if it's not already running
async function startServer() {
  const port = 5001;
  const isRunning = await checkIfServerRunning(port);
  
  if (!isRunning) {
    console.log('Starting server on port', port);
    const server = spawn('node', ['server.js'], {
      detached: true,
      stdio: 'inherit'
    });
    
    server.unref();
    
    // Wait for server to start
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const serverStarted = await checkIfServerRunning(port);
      if (serverStarted) {
        console.log('Server started successfully!');
        return true;
      }
      attempts++;
      console.log(`Waiting for server to start... (${attempts}/${maxAttempts})`);
    }
    
    console.log('Failed to start server after multiple attempts');
    return false;
  }
  
  return true;
}

startServer()
  .then(success => {
    if (success) {
      console.log('Server is now running at http://localhost:5001');
      console.log('You can now test your application');
    } else {
      console.log('Could not verify server is running');
    }
  })
  .catch(err => {
    console.error('Error:', err);
  });
