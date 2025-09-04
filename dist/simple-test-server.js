const http = require('http');

// Create a simple HTTP server
const server = http.createServer((req, res) => {
  console.log(`Received request for ${req.url}`);
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'OK',
    message: 'Simple test server is running',
    timestamp: new Date().toISOString(),
    url: req.url
  }));
});

// Listen on port 5000
const PORT = 5000;

server.on('error', (err) => {
  console.error('Server error:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Try a different port.`);
  }
});

server.listen(PORT, () => {
  console.log(`Simple HTTP server is listening on port ${PORT}`);
  console.log(`Test it by navigating to http://localhost:${PORT}`);
});
