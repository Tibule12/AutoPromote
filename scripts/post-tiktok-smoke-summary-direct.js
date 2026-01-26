#!/usr/bin/env node
// post-tiktok-smoke-summary-direct.js
// Runs runAlertChecks() and posts a concise summary to SLACK_ALERT_WEBHOOK_URL

const { runAlertChecks } = require('../src/services/alertingService');

async function postJson(url, body) {
  try {
    const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
    const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { ok: r && r.status >= 200 && r.status < 300, status: r && r.status };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  const webhook = process.env.SLACK_ALERT_WEBHOOK_URL;
  const runUrl = process.env.GITHUB_RUN_URL || 'Run URL not provided';
  if (!webhook) {
    console.log('No SLACK_ALERT_WEBHOOK_URL set; skipping direct Slack summary.');
    return;
  }

  console.log('Running alert checks to produce direct summary...');
  const r = await runAlertChecks();
  const t = (r && r.tiktok) || {};
  const alerted = !!t.alerted;
  let details = '';
  if (alerted) details = `\n\nAlert details:\n\n${JSON.stringify(t, null, 2)}\n`;
  const text = `TikTok smoke run summary. *Alerted:* ${alerted ? ':rotating_light: YES' : ':white_check_mark: no'}${details}\n\n<${runUrl}|View run logs>`;

  console.log('Posting Slack summary...');
  const res = await postJson(webhook, { text });
  console.log('Posted Slack summary:', res.ok ? 'ok' : `failed: ${res.status || res.error}`);
}

main().catch(e => console.error(e && (e.stack || e.message || e)));
