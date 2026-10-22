#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { createAssistance } = require('../src/productAssistance');
const { ROOT, CATALOG } = require('../src/productKnowledge');
const { questionCoverage } = require('../test/product-assistance/question-coverage');
const book = JSON.parse(fs.readFileSync(path.join(ROOT, CATALOG)));
const service = createAssistance({ internalBook: book });
const results = [];
const started = performance.now();
for (const row of questionCoverage(book, { catalogue: !process.argv.includes('--wording-only') })) {
  const start = performance.now();
  try {
    const reply = service.answer(row.input);
    const ids = reply.features.map(f => f.feature_id);
    const relevance = row.noFeature ? !ids.length : !row.anyFeature.length || (row.primary ? row.anyFeature.includes(ids[0]) : row.anyFeature.some(id => ids.includes(id)));
    const control = !row.control || reply.controls.some(c => c.control_id === row.control);
    const task = !row.task || reply.tasks.some(t => t.task_id === row.task);
    results.push({ id: row.id, category: row.category, question: row.input.question, mode: row.input.mode || 'EXPLAIN', noError: true, relevance, control, task, features: ids, gap: reply.documentation_gap?.reason || null, ms: Math.round(performance.now() - start) });
  } catch (error) {
    results.push({ id: row.id, category: row.category, question: row.category === 'sensitive-text' ? '[synthetic privacy case]' : row.input.question, noError: false, error: error.code || error.message, ms: Math.round(performance.now() - start) });
  }
}
const failures = results.filter(r => !r.noError || !r.relevance || !r.control || !r.task);
const summary = { checkedAt: new Date().toISOString(), knowledgeVersion: book.knowledge_version, cases: results.length, noErrors: results.filter(r => r.noError).length, relevant: results.filter(r => r.relevance && r.control && r.task).length, failures: failures.length, slowestMs: Math.max(...results.map(r => r.ms)), elapsedMs: Math.round(performance.now() - started), categories: Object.fromEntries([...new Set(results.map(r => r.category))].map(category => [category, { cases: results.filter(r => r.category === category).length, failures: failures.filter(r => r.category === category).length }])) };
const outputIndex = process.argv.indexOf('--output');
if (outputIndex >= 0) {
  const filename = path.resolve(process.argv[outputIndex + 1]);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, JSON.stringify({ summary, results }, null, 2) + '\n');
}
console.log(JSON.stringify(summary, null, 2));
if (failures.length) {
  console.log(JSON.stringify(failures.slice(0, 30), null, 2));
  process.exitCode = 1;
}
