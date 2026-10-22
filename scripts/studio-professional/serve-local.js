#!/usr/bin/env node
const express = require('express');
const rateLimit = require('express-rate-limit');
const http = require('node:http');
const path = require('node:path');
const build = path.resolve(__dirname, '../../reports/studio-professional-editing-20261013/proof/local-app');
const app = express();
app.use(rateLimit({ windowMs: 60000, max: 600, standardHeaders: true, legacyHeaders: false }));
// Billing uses same-origin API paths. Mirror the ordinary reverse proxy rather
// than serving index.html as a successful-looking API response during local QA.
const apiPort = Number(process.env.STUDIO_QA_API_PORT || 5120);
if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) throw new Error('Invalid local API port');
app.use('/api', (req, res) => {
  const upstream = http.request({ host: '127.0.0.1', port: apiPort,
    path: req.originalUrl, method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${apiPort}` } }, response => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res);
  });
  upstream.setTimeout(30000, () => upstream.destroy(new Error('Local API timed out')));
  upstream.on('error', () => {
    if (!res.headersSent) res.status(502).json({ message: 'Local API unavailable' });
    else res.destroy();
  });
  res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
  req.pipe(upstream);
});
app.use(express.static(build));
app.get(/.*/, (_req, res) => res.sendFile(path.join(build, "index.html")));
// The other editing track owns ::1:5000. Keep its listener untouched. Our
// headless browser resolves localhost to IPv4, preserving the real login origin.
const server = app.listen(5000, "127.0.0.1", error => {
  if (error) {
    console.error(error.code);
    process.exit(1);
  }
  console.log("Isolated normal Studio App on IPv4 localhost:5000");
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
