#!/usr/bin/env node
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const q = require('./run'), f = require('./flows');
(async () => {
  const { browser, page } = await q.connect();
  try {
    await f.open(page, 'Studio QA 20261008 captions');
    await f.duplicate(page, 'Studio QA 20261008 model language repair');
    await q.tool(page, 'Captions');
    const events = [];
    page.on('response', async response => {
      const route = new URL(response.url()).pathname;
      if (!/transcribe-source|\/api\/media\/status\//.test(route)) return;
      const body = await response.json().catch(() => ({}));
      events.push({ path: route, status: response.status(), jobId: body.jobId, jobStatus: body.status });
    });
    await page.getByTestId('generate-live-transcript').click();
    await page.waitForFunction(() => {
      const e = document.querySelector('.caption-generation-status');
      return e && /is-review|is-ready|is-failed/.test(e.className);
    }, undefined, { timeout: 240000 });
    const message = await page.locator('.caption-generation-status').innerText();
    assert.equal(await page.locator('.caption-generation-status.is-failed').count(), 0, message);
    const captions = await page.locator('textarea[aria-label^="Caption "]').evaluateAll(es => es.filter(e => e.getAttribute('aria-label') !== 'Caption copy').map(e => ({ label: e.getAttribute('aria-label'), text: e.value })));
    assert(captions.length, 'No real editable captions returned');
    assert(!/· English(?: ·|$)/.test(message), 'Unsupported decoder token still appears as English');
    await page.getByTestId('studio-save-project').click();
    await q.inspect(page, 'caption-model-language-retest');
    const attempt = { at: new Date().toISOString(), realAuth: true, noMocks: true, events, captions, message, wordingApproved: false };
    fs.writeFileSync(path.join(q.report, 'caption-model-language-retest.json'), JSON.stringify(attempt, null, 2));
    q.record('captions', { gpuUsed: true, status: 'FAIL', failureFound: 'Mixed-language recognition contains repeated/uncertain wording; decoder token falsely labelled it English',
      fixApplied: 'Pinned Swivuriso metadata identifies unsupported language tokens; decoder language is preserved separately and cannot label spoken language',
      retestResult: 'Real GPU transcription returned editable review drafts without the false English label',
      remainingIssue: 'Recognition wording remains unapproved. Model/provider selection for English and mixed speech, plus full style animation parity, remain unresolved.', userFacingSeverity: 'High' }, attempt);
    console.log(JSON.stringify({ message, captions: captions.length, falseEnglishLabelRemoved: true, wordingApproved: false }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
