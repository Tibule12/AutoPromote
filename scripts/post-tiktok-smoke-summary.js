#!/usr/bin/env node
// post-tiktok-smoke-summary.js
// Reads test-tiktok-result.log, builds a concise Slack message and posts to SLACK_ALERT_WEBHOOK_URL.

const fs = require('fs');

async function main() {
  const webhook = process.env.SLACK_ALERT_WEBHOOK_URL;
  const runUrl = process.env.GITHUB_RUN_URL || 'Run URL not provided';
  if (!webhook) {
    console.log('No SLACK_ALERT_WEBHOOK_URL set; skipping Slack summary.');
    return;
  }

  let log;
  try {
    log = fs.readFileSync('test-tiktok-result.log', 'utf8');
  } catch (e) {
    console.log('No test-tiktok-result.log found; skipping Slack summary.');
    return;
  }

  const m = log.match(/Check result:\s*(\{[\s\S]*\})/);
  if (!m) {
    const payload = { text: `TikTok smoke run completed but no check result found. <${runUrl}|View run>` };
    await post(webhook, payload);
    return;
  }

  let res;
  try {
    res = JSON.parse(m[1]);
  } catch (e) {
    const payload = { text: `TikTok smoke run completed but failed to parse check result. <${runUrl}|View run>` };
    await post(webhook, payload);
    return;
  }

  const t = res.tiktok || {};
  const alerted = !!t.alerted;
  let details = '';
  if (alerted) {
    details = `\n\nAlert details:\n\`
${JSON.stringify(t, null, 2)}\``;
  }

  const text = `TikTok smoke run completed. *Alerted:* ${alerted ? ':rotating_light: YES' : ':white_check_mark: no'}${details}\n\n<${runUrl}|View run logs>`;
  await post(webhook, { text });
}

async function post(url, body) {
  try {
    const fetchFn = typeof fetch !== 'undefined' ? fetch : require('node-fetch');
    const r = await fetchFn(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const ok = r && (r.status >= 200 && r.status < 300);
    console.log('Posted Slack summary:', ok ? 'ok' : `failed(${r && r.status})`);
  } catch (e) {
    console.error('Failed to POST Slack summary:', e && (e.message || e));
  }
}

main().catch(e => {
  console.error(e && (e.stack || e.message || e));
});