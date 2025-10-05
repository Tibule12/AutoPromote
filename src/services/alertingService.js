// alertingService.js - outbound operational alerts (webhook / Slack)
const { getConfig } = require('./configService');
const { db } = require('../firebaseAdmin');

async function postJson(url, body) {
  try {
    const payload = JSON.stringify(body);
    const fetchFn = (typeof fetch !== 'undefined') ? fetch : require('node-fetch');
    const resp = await fetchFn(url, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: payload });
    return { ok: resp.status>=200 && resp.status<300, status: resp.status };
  } catch(e){ return { ok:false, error:e.message }; }
}

async function sendAlert({ type, message, severity='info', meta={} }) {
  try {
    const cfg = await getConfig();
    const a = cfg.alerting || {};
    if (a.enabledEvents && Array.isArray(a.enabledEvents) && !a.enabledEvents.includes(type)) return { skipped:true, reason:'disabled_event' };
    if (!a.webhookUrl && !a.slackWebhookUrl) return { skipped:true, reason:'no_destination' };
    const at = new Date().toISOString();
    const alertDoc = { type, message, severity, meta, at };
    try { await db.collection('events').add({ ...alertDoc, eventType:'alert' }); } catch(_){ }
    if (a.webhookUrl) await postJson(a.webhookUrl, alertDoc);
    if (a.slackWebhookUrl) await postJson(a.slackWebhookUrl, { text: `*[${severity.toUpperCase()}]* ${type}: ${message}\n\n${Object.keys(meta||{}).length? '```'+JSON.stringify(meta,null,2)+'```':''}` });
    return { ok:true };
  } catch(e){ return { ok:false, error:e.message }; }
}

async function checkExplorationDrift() {
  try {
    const cfg = await getConfig();
    const target = cfg.banditExplorationTarget || 0.25;
    const tol = cfg.banditExplorationTolerance || 0.05;
    const snap = await db.collection('bandit_selection_metrics').orderBy('at','desc').limit(300).get();
    if (snap.empty) return { skipped:true };
    let total=0, explored=0; snap.forEach(d=> { const v=d.data(); total++; if (v.exploration) explored++; });
    const ratio = total? explored/total : 0;
    const diff = Math.abs(ratio - target);
    if (diff > tol * 2) {
      await sendAlert({ type:'exploration_drift', severity:'warning', message:`Exploration ratio ${ratio.toFixed(3)} outside target ${target} (tol ${tol})`, meta:{ ratio, target, tol, total } });
      return { alerted:true, ratio };
    }
    return { ok:true, ratio };
  } catch(e){ return { error:e.message }; }
}

async function checkDiversity() {
  try {
    const cfg = await getConfig();
    const minRatio = (cfg.alerting && cfg.alerting.minDiversityRatio) || 0.15;
    const snap = await db.collection('variant_stats').orderBy('updatedAt','desc').limit(200).get();
    if (snap.empty) return { skipped:true };
    let activeSet = new Set(); let total=0;
    snap.forEach(d=> { const v=d.data(); if(!v.platforms) return; Object.values(v.platforms).forEach(p => (p.variants||[]).forEach(row => { total++; if(!row.suppressed && !row.quarantined) activeSet.add(row.value); })); });
    const diversityRatio = total? activeSet.size/total : 0;
    if (diversityRatio < minRatio) {
      await sendAlert({ type:'variant_diversity_low', severity:'warning', message:`Variant diversity low ${(diversityRatio*100).toFixed(1)}% (< ${(minRatio*100).toFixed(1)}%)`, meta:{ diversityRatio, activeUnique: activeSet.size, total } });
      return { alerted:true, diversityRatio };
    }
    return { ok:true, diversityRatio };
  } catch(e){ return { error:e.message }; }
}

async function recordRollbackAlert({ reason, dropPct, manual }) {
  const severity = reason === 'ctr_drop' ? 'critical' : 'warning';
  await sendAlert({ type: manual ? 'bandit_manual_rollback' : 'bandit_auto_rollback', severity, message:`Bandit weights rollback (${manual?'manual':'auto'}): ${reason}`, meta:{ reason, dropPct, manual } });
}

async function recordEmailFailure(meta) {
  await sendAlert({ type:'email_delivery_failure', severity:'warning', message:'Email provider failure', meta });
}

async function runAlertChecks() {
  const r1 = await checkExplorationDrift();
  const r2 = await checkDiversity();
  return { exploration: r1, diversity: r2 };
}

module.exports = { sendAlert, checkExplorationDrift, checkDiversity, runAlertChecks, recordRollbackAlert, recordEmailFailure };
