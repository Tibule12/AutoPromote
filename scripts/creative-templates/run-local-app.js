#!/usr/bin/env node
// Serve the normal current-branch optimized React app over localhost's
// separate IPv6 listener. Existing Storage CORS permits localhost:5000; the
// historical IPv4 app is preserved. No fixture or auth bypass is introduced.
const express = require('express');
const rateLimit = require("express-rate-limit");
const path = require('path');
const frontendRequire = require('module').createRequire(path.resolve(__dirname, '../../frontend/package.json'));
const { createProxyMiddleware } = frontendRequire('http-proxy-middleware');
const app = express();
app.use(rateLimit({ windowMs: 60000, max: 3000, standardHeaders: true, legacyHeaders: false }));
const build = process.env.STUDIO_QA_BUILD ? path.resolve(process.env.STUDIO_QA_BUILD)
  : path.resolve(__dirname, '../../reports/model-capability-runtime-v1-20261009/proof/launch-template/local-app');
app.use(express.static(build));
app.get(/.*/, (_req, res) => res.sendFile(path.join(build, 'index.html')));
const server = app.listen(5000, '::1', () => console.log('Normal branch app available on IPv6 localhost:5000'));
const api = express();
api.use(rateLimit({ windowMs: 60000, max: 600, standardHeaders: true, legacyHeaders: false }));
api.use(createProxyMiddleware({ target: 'http://127.0.0.1:5119', changeOrigin: true }));
const apiServer = api.listen(5119, '::1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => apiServer.close(() => process.exit(0))));
