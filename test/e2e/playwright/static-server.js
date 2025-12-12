const express = require('express');
const path = require('path');
const app = express();
const port = process.env.STATIC_SERVER_PORT || 5000;
app.use(express.static(path.join(__dirname, '../../../frontend/build')));
// Serve e2e fixtures so we can load standalone HTML test pages
app.use(express.static(path.join(__dirname, '../../fixtures')));
// Fallback to index.html for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../../frontend/build/index.html'));
});
app.listen(port, () => console.log('Static server started on port', port));
