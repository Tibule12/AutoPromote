#!/usr/bin/env node
const express = require('express');
const rateLimit = require("express-rate-limit");
const path = require('node:path');
const build = path.resolve(__dirname, '../../reports/studio-professional-editing-20261013/proof/local-app');
const app = express();
app.use(rateLimit({ windowMs: 60000, max: 3000, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(build));
app.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
// The other editing track owns ::1:5000. Keep its listener untouched. Our
// headless browser resolves localhost to IPv4, preserving the real login origin.
const server = app.listen(5000, '127.0.0.1', error => {
  if (error) { console.error(error.code); process.exit(1); }
  console.log('Isolated normal Studio App on IPv4 localhost:5000');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal,
  () => server.close(() => process.exit(0)));
