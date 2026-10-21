'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAssistance } = require('../../src/productAssistance');
const { ROOT, CATALOG } = require('../../src/productKnowledge');
const { questionCoverage } = require('./question-coverage');
const book = JSON.parse(fs.readFileSync(path.join(ROOT, CATALOG)));
test('all public features, controls, guides and independent question categories resolve without throwing or changing readiness', () => {
  const service = createAssistance({ internalBook: book });
  for (const row of questionCoverage(book)) {
    const reply = service.answer(row.input);
    const ids = reply.features.map(f => f.feature_id);
    const label = `${row.id}: ${row.input.question}`;
    assert.equal(reply.read_only, true, label);
    assert.equal(reply.execution_authority, 'NONE', label);
    assert.deepEqual(reply.actions, [], label);
    assert(reply.answer.length, label);
    if (row.noFeature) assert.deepEqual(ids, [], label);
    else if (row.anyFeature.length) assert(row.primary ? row.anyFeature.includes(ids[0]) : row.anyFeature.some(id => ids.includes(id)), `${label}: ${ids}`);
    if (row.control) assert(reply.controls.some(c => c.control_id === row.control), label);
    if (row.task) assert(reply.tasks.some(t => t.task_id === row.task), label);
    for (const feature of reply.features) assert.equal(feature.status, book.features.find(f => f.feature_id === feature.feature_id).status, label);
  }
});
test('normal questions with private values are answered after redaction; values never reach receipts or the gap journal', () => {
  let retained;
  const service = createAssistance({ internalBook: book, journal: { read: () => ({ receipts: [], gaps: [] }), write: value => { retained = value; } } });
  for (const question of [
    'qa@example.invalid cannot sign in',
    'How do I import https://example.invalid/private-file.mp4?token=pretend-secret',
    'api_key="pretend-secret" how do I connect my account?',
    'password: pretend-secret please help me sign in',
    'My file is /home/private-person/private-file.mp4',
    'Bearer pretend-secret why is it not working?',
    '-----BEGIN PRIVATE KEY-----\npretend-secret\n-----END PRIVATE KEY-----',
    'What does https:// mean?',
    'What if the password: field is empty?',
    'token=',
    'The file starts with /home/',
    'Why does my file path start with C:\\?',
  ]) {
    const reply = service.answer({ question });
    assert(reply.privacy_notice);
    assert(!/qa@example|private-person|private-file|pretend-secret|BEGIN PRIVATE/.test(JSON.stringify({ retained, reply })));
  }
});
test('unknown codes, non-English text, ambiguous input and unrelated questions produce useful bounded replies', () => {
  const service = createAssistance({ internalBook: book });
  for (const question of ['こんにちは', '...', 'What is the weather tomorrow?', 'QX_UNKNOWN_RENDER_FAILURE']) {
    const reply = service.answer({ question });
    assert(reply.documentation_gap);
    assert.equal(typeof reply.answer, 'string');
    assert.deepEqual(reply.actions, []);
  }
  assert.match(service.answer({ question: 'Hi' }).answer, /What would you like to do/);
  assert.match(service.answer({ question: 'Can you guarantee a million views?' }).answer, /does not promise guaranteed/);
  for (const error_code of ['constructor', 'toString', 'hasOwnProperty']) {
    const reply = service.answer({ question: 'Why is this blocked?', context: { error_code } });
    assert.equal(reply.answer, 'This error is not documented yet.');
  }
});
test('normal punctuation, Unicode, code-like text and maximum-length questions cannot crash or execute actions', () => {
  const service = createAssistance({ internalBook: book });
  for (const question of ['<img src=x onerror=alert(1)> captions', '"; DROP TABLE projects; --', 'CAPTIONS??? 😤', 'keyframes\nplease', 'x'.repeat(1000), 'a '.repeat(500), '🎬'.repeat(500)]) {
    const reply = service.answer({ question });
    assert.equal(typeof reply.answer, 'string');
    assert.equal(reply.read_only, true);
    assert.deepEqual(reply.actions, []);
  }
});
