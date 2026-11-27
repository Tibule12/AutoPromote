'use strict';
const express = require('express');
const path = require('node:path');
const rateLimit = require('express-rate-limit');
const { createAssistance } = require('../productAssistance');
const { generatedFiles } = require('../productKnowledge/generate');
const { ROOT, loadKnowledge } = require('../productKnowledge');
const { privateJournal } = require('../productAssistance/journal');

function createProductAssistanceRoutes({ service, files } = {}) {
  const router = express.Router();
  const limiter = rateLimit({ windowMs: 60000, max: 30, standardHeaders: true, legacyHeaders: false });
  let active = service;
  let documents;
  const resolve = () => (active ||= createAssistance({ journal: privateJournal(path.join(ROOT, 'tmp/product-assistance/receipts.v1.private.json')) }));
  router.use(limiter, express.json({ limit: '8kb' }));
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.post('/ask', (req, res) => {
    try { res.json(resolve().answer(req.body)); }
    catch (error) {
      res.status(error.status || 503).json({ error: error.status === 400 ? error.code : 'PRODUCT_DOCUMENTATION_UNAVAILABLE' });
    }
  });
  // Only generated, safe public documentation is served. No arbitrary repo file
  // route and no internal receipts/gaps endpoint. No auth credentials are needed.
  router.get('/docs/*path', (req, res) => {
    try {
      documents ||= generatedFiles(loadKnowledge().book);
      files ||= new Set([...documents.keys()].map(file => file.replace('docs/product/', '')));
      const file = req.params.path.join('/');
      if (!files.has(file) || file.includes('..')) return res.status(404).json({ error: 'PUBLIC_DOCUMENT_NOT_FOUND' });
      const content = documents.get(`docs/product/${file}`);
      if (!content) return res.status(404).json({ error: 'PUBLIC_DOCUMENT_NOT_FOUND' });
      res.type(file.endsWith('.json') ? 'application/json' : file.endsWith('.jsonl') ? 'application/x-ndjson' : 'text/plain');
      // Serve reviewed projection bytes, never an independently edited file,
      // symlink, private filesystem path or stale generated copy.
      return res.send(content);
    } catch { return res.status(503).json({ error: 'PRODUCT_DOCUMENTATION_UNAVAILABLE' }); }
  });
  router.use((error, _req, res, _next) => res.status(error.status === 413 ? 413 : 400).json({ error: error.status === 413 ? 'HELP_INPUT_TOO_LARGE' : 'HELP_INPUT_INVALID' }));
  return router;
}
module.exports = createProductAssistanceRoutes;
