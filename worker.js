// worker.js - Background job loop for promotion tasks & stats polling
require('dotenv').config();
const { db } = require('./src/firebaseAdmin');
const { processNextPlatformTask, processNextYouTubeTask } = require('./src/services/promotionTaskQueue');
let poller; try { poller = require('./src/services/youtubeStatsPoller'); } catch(_) { poller = null; }
const { setStatus } = require('./src/services/statusRecorder');
let engagementIngestion; try { engagementIngestion = require('./src/services/engagementIngestionService'); } catch(_) { }

const LOOP_INTERVAL_MS = parseInt(process.env.JOB_LOOP_INTERVAL_MS || '5000', 10);
const YT_POLL_INTERVAL_MS = parseInt(process.env.YT_STATS_LOOP_INTERVAL_MS || '60000', 10);
const ENABLE = process.env.ENABLE_BACKGROUND_JOBS === 'true';

if (!ENABLE) {
  console.log('[worker] ENABLE_BACKGROUND_JOBS not true; exiting');
  process.exit(0);
}

let lastYouTubePoll = 0;

async function loop() {
  const startedAt = Date.now();
  try {
    // Heartbeat
    try { await setStatus('worker_loop', { ts: Date.now(), loopInterval: LOOP_INTERVAL_MS }); } catch(_){ }

    // Process one platform task (if any)
    try {
      const res = await processNextPlatformTask();
      if (res) console.log('[worker] platform_task', res);
    } catch (e) { console.warn('[worker] platform_task error:', e.message); }

    // Process one YouTube upload task
    try {
      const res = await processNextYouTubeTask();
      if (res) console.log('[worker] youtube_upload_task', res);
    } catch (e) { console.warn('[worker] youtube_upload_task error:', e.message); }

    // Periodic YouTube stats poll
    if (poller && Date.now() - lastYouTubePoll >= YT_POLL_INTERVAL_MS) {
      lastYouTubePoll = Date.now();
      try {
        const velocityThreshold = parseFloat(process.env.YT_VELOCITY_HIGH_THRESHOLD || '50');
        const batch = await poller.pollYouTubeStatsBatch({ batchSize: parseInt(process.env.YT_STATS_BATCH_SIZE || '5',10), velocityThreshold });
        console.log('[worker] youtube_stats_batch', batch.processed);
        await setStatus('youtube_stats_poller', { ts: Date.now(), processed: batch.processed });
      } catch (e) {
        console.warn('[worker] youtube_stats_batch error:', e.message);
      }
    }
    // Engagement ingestion (lightweight) every other stats cycle
    if (engagementIngestion && Math.random() < 0.3) {
      try {
        const eg = await engagementIngestion.ingestBatch({ limit: 20 });
        if (eg.processed) await setStatus('engagement_ingest', { ts: Date.now(), processed: eg.processed });
      } catch(e){ console.warn('[worker] engagement_ingest error:', e.message); }
    }
    // Periodic variant pruning (probabilistic trigger)
    if (Math.random() < 0.05) {
      try {
        // Sample a high-velocity content doc and prune variants
        const highSnap = await require('./src/firebaseAdmin').db.collection('content')
          .where('youtube.velocityStatus','==','high')
          .limit(1).get();
        if (!highSnap.empty) {
          const c = highSnap.docs[0];
            const fetch = require('node-fetch');
            const base = process.env.WORKER_SELF_BASE_URL || '';
            if (base) {
              await fetch(base + '/api/metrics/variants/prune', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ contentId: c.id, keepTop:2, minPosts:2 }) });
            }
        }
      } catch (e) { console.warn('[worker] variant_prune error:', e.message); }
    }
  } catch (e) {
    console.warn('[worker] loop error top-level:', e.message);
  } finally {
    const elapsed = Date.now() - startedAt;
    const delay = Math.max(LOOP_INTERVAL_MS - elapsed, 500);
    setTimeout(loop, delay);
  }
}

console.log('[worker] starting background loop interval', LOOP_INTERVAL_MS, 'ms');
loop();
