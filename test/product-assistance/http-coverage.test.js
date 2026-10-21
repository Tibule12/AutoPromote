'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const express = require('express');
const supertest = require('supertest');
const { loadKnowledge } = require('../../src/productKnowledge');
const { createAssistance } = require('../../src/productAssistance');
const routes = require('../../src/routes/productAssistanceRoutes');
const { questionCoverage } = require('./question-coverage');
test('the broad question corpus crosses the real HTTP parser/router and returns relevant 200 replies', async () => {
  const { book } = loadKnowledge();
  // Isolate test receipts from retained user receipts. Each fixture owns a fresh
  // normal rate limiter; this is input qualification, not a production load test.
  const service = createAssistance({ internalBook: book });
  const cases = questionCoverage(book);
  const results = [];
  let client;
  for (let i = 0; i < cases.length; i++) {
    if (i % 25 === 0) {
      const app = express();
      app.use('/api/product-assistance', routes({ service }));
      client = supertest(app);
    }
    const row = cases[i];
    const response = await client.post('/api/product-assistance/ask').send(row.input).expect(200);
    const reply = response.body, ids = reply.features.map(f => f.feature_id);
    const label = `${row.id}: ${row.input.question}`;
    assert(reply.answer.length, label);
    assert.equal(reply.read_only, true, label);
    assert.deepEqual(reply.actions, [], label);
    if (row.noFeature) assert.deepEqual(ids, [], label);
    else if (row.anyFeature.length) assert(row.primary ? row.anyFeature.includes(ids[0]) : row.anyFeature.some(id => ids.includes(id)), `${label}: ${ids}`);
    if (row.control) assert(reply.controls.some(c => c.control_id === row.control), label);
    if (row.task) assert(reply.tasks.some(t => t.task_id === row.task), label);
    results.push({ id: row.id, category: row.category, status: response.status, features: ids });
  }
  if (process.env.ASSISTANCE_HTTP_PROOF) fs.writeFileSync(process.env.ASSISTANCE_HTTP_PROOF, JSON.stringify({ checkedAt: new Date().toISOString(), cases: results.length, statuses: { 200: results.length }, mockedReplies: false, isolatedRateLimiterFixtures: Math.ceil(cases.length / 25), userReceiptJournalTouched: false, results }, null, 2) + '\n');
});
test('throttling and invalid client payloads stay controlled instead of throwing or admitting unbounded requests', async () => {
  const { book } = loadKnowledge();
  const app = express();
  app.use('/api/product-assistance', routes({ service: createAssistance({ internalBook: book }) }));
  const client = supertest(app);
  await client.post('/api/product-assistance/ask').send({ question: 'Hi', context: { project: {} } }).expect(400);
  await client.post('/api/product-assistance/ask').set('Content-Type', 'application/json').send('{broken').expect(400);
  await client.post('/api/product-assistance/ask').send({ question: 'x'.repeat(9000) }).expect(413);
  for (let i = 0; i < 27; i++) await client.post('/api/product-assistance/ask').send({ question: 'Hi' }).expect(200);
  const limited = await client.post('/api/product-assistance/ask').send({ question: 'Hi' }).expect(429);
  assert(Number(limited.headers['retry-after']) > 0);
});
