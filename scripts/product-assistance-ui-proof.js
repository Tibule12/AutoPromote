#!/usr/bin/env node
'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { sha } = require('../src/productKnowledge');
const { saveAuthenticatedState } = require('./creative-templates/studio-session');
const q = require('../test/e2e/playwright/studio-stability/run');
const state = process.env.STUDIO_QA_STORAGE_STATE;
const folder = path.resolve('reports/model-capability-runtime-v1-20261009/proof/product-assistance-v1');
async function records(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('autopromote-viral-studio', 1);
    request.onerror = () => reject(new Error('Project store unavailable'));
    request.onsuccess = () => {
      const db = request.result; const read = db.transaction('projects', 'readonly').objectStore('projects').getAll();
      read.onsuccess = () => { db.close(); resolve(read.result.map(r => ({ id: r.id, document: r.snapshot?.studioDocument }))); };
    };
  }));
}
async function main() {
  assert(state && fs.existsSync(state), 'Retained real login required');
  fs.mkdirSync(folder, { recursive: true });
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--mute-audio', '--disk-cache-size=1048576', '--media-cache-size=1048576'] });
  const context = await browser.newContext({ storageState: state, viewport: { width: 1600, height: 1050 }, timezoneId: 'Africa/Johannesburg' });
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const transcripts = [], writes = [];
  page.on('request', req => { const p = new URL(req.url()).pathname; if (req.method() !== 'GET' && p.startsWith('/api/')) writes.push({ method: req.method(), path: p }); });
  const askResponse = () => page.waitForResponse(r => new URL(r.url()).pathname === '/api/product-assistance/ask' && r.request().method() === 'POST');
  const help = async (label, expectedId, status, file) => {
    const pending = askResponse(); await page.getByRole('button', { name: `Help: ${label}`, exact: true }).click();
    const response = await pending; assert.equal(response.status(), 200); const result = await response.json();
    assert.equal(result.features[0].feature_id, expectedId); assert.equal(result.features[0].status, status);
    const dialog = page.getByRole('dialog', { name: 'Ask AutoPromote' }); await dialog.getByText(result.features[0].name, { exact: false }).first().waitFor();
    await dialog.screenshot({ path: path.join(folder, `${file}.png`) });
    transcripts.push({ surface: label, question: 'What is this?', result });
    return dialog;
  };
  try {
    await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).waitFor({ timeout: 60000 });
    const before = await records(page);
    await page.getByRole('button', { name: 'Ask AutoPromote', exact: true }).click();
    const initialDialog = page.getByRole('dialog'); const comparisonPending = askResponse();
    await initialDialog.getByLabel('Question', { exact: true }).fill('How is Cam Combiner different from AI Director?');
    await initialDialog.getByRole('button', { name: 'Ask', exact: true }).click();
    const comparison = await (await comparisonPending).json();
    assert(comparison.features.some(f => f.feature_id === 'cam_combiner.switching'));
    assert(comparison.features.some(f => f.feature_id === 'director.proposals'));
    transcripts.push({ surface: 'Dashboard Ask AutoPromote', question: 'How is Cam Combiner different from AI Director?', result: comparison });
    await initialDialog.getByRole('button', { name: 'Close product help' }).click();
    await page.getByRole('button', { name: 'Cam Combiner', exact: true }).click();
    await help('Cam Combiner', 'cam_combiner.switching', 'PARTIAL', 'b-cam-combiner');
    await page.getByRole('button', { name: 'Close product help' }).click();
    await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).click();
    await page.getByRole('button', { name: 'EMBER — music and cinematic sound · 20261010', exact: true }).click();
    await page.getByTestId('viral-studio-workspace').waitFor({ timeout: 60000 });
    await page.locator('video,audio').evaluateAll(elements => elements.forEach(el => { el.muted = true; el.pause(); }));
    await q.tool(page, 'Motion');
    await page.getByRole('button', { name: 'Transform keyframes', exact: true }).click();
    await help('Motion / Transform Keyframes', 'studio.keyframes', 'FUNCTIONAL', 'a-keyframes');
    await page.getByRole('button', { name: 'Close product help' }).click();
    await q.tool(page, 'Composite');
    const dialog = await help('Text Behind Subject / Compositing', 'studio.compositing.text_behind_subject', 'PARTIAL', 'c-text-behind-subject');
    const pending = askResponse(); await dialog.getByLabel('Question', { exact: true }).fill('What do I do next?'); await dialog.getByRole('button', { name: 'Ask', exact: true }).click();
    const result = await (await pending).json(); assert.equal(result.features[0].feature_id, 'studio.compositing.text_behind_subject');
    transcripts.push({ surface: 'Safe selected feature context', question: 'What do I do next?', result });
    await dialog.getByRole('button', { name: 'Clear context', exact: true }).click();
    const global = page.getByRole('dialog'); const diagnostic = askResponse();
    await global.getByLabel('Question', { exact: true }).fill("Why isn't cleanup removing the object?"); await global.getByLabel('Help mode').selectOption('DIAGNOSE'); await global.getByRole('button', { name: 'Ask', exact: true }).click();
    const cleanup = await (await diagnostic).json(); assert.equal(cleanup.features[0].status, 'PROXY_ONLY'); assert.deepEqual(cleanup.features[0].how_to_use, []);
    await global.getByText('PROXY_ONLY', { exact: true }).waitFor(); await global.screenshot({ path: path.join(folder, 'c-cleanup-proxy.png') });
    transcripts.push({ surface: 'Global diagnosis', question: "Why isn't cleanup removing the object?", result: cleanup });
    const unknownPending = askResponse(); await global.getByLabel('Question', { exact: true }).fill('UNKNOWN_EXPORT_GLITCH');
    await global.getByRole('button', { name: 'Ask', exact: true }).click();
    const unknown = await (await unknownPending).json(); assert.equal(unknown.answer, 'This error is not documented yet.'); assert(unknown.documentation_gap);
    await global.getByText('This error is not documented yet.', { exact: true }).waitFor();
    await global.screenshot({ path: path.join(folder, 'unknown-error-gap.png') });
    transcripts.push({ surface: 'Unknown error', question: 'UNKNOWN_EXPORT_GLITCH', result: unknown });
    await global.locator('summary').filter({ hasText: 'Based on AutoPromote documentation' }).click();
    const link = global.getByRole('link', { name: 'Documentation index', exact: true });
    const documentation = await context.request.get(await link.getAttribute('href')); assert.equal(documentation.status(), 200);
    assert((await documentation.text()).includes('AutoPromote product knowledge'));
    await global.getByRole('button', { name: 'Close product help' }).click();
    assert.equal(sha(Buffer.from(JSON.stringify(await records(page)))), sha(Buffer.from(JSON.stringify(before))), 'Read-only help must preserve every saved canonical project');
    assert(!writes.some(r => /render|upload|publish|model-runtime|promotion-schedules/.test(r.path)), 'Help must not invoke product jobs or project writes');
    saveAuthenticatedState(await context.storageState({ indexedDB: true }), state);
    const proof = { createdAt: new Date().toISOString(), branch: 'agent/product-knowledge-system-v1', headless: true, muted: true, realAuthenticatedApp: true, mockedResponses: false, projectDocumentsUnchanged: true, documentationLinkVerified: true, apiRequests: writes, transcripts, newModelJobs: 0, newRenders: 0, publications: 0 };
    fs.writeFileSync(path.join(folder, 'ui-proof.private.json'), JSON.stringify(proof, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ result: 'PASS', qualificationCases: 3, transcripts: transcripts.length, savedProjectsUnchanged: before.length, path: path.join(folder, 'ui-proof.private.json') }));
  } catch (error) {
    await page.screenshot({ path: path.join(folder, 'ui-failure.png') }).catch(() => {}); throw error;
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
