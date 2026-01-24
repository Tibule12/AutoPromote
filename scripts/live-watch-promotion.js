/*
Live watcher: polls promotion_tasks, platform_posts, and notifications every 5s and prints changes.
Usage:
  # ensure GOOGLE_APPLICATION_CREDENTIALS set to your local service account file
  node ./scripts/live-watch-promotion.js --poll=5
Options:
  --poll: seconds between polls (default 5)
*/

const argv = require('minimist')(process.argv.slice(2));
const pollSec = parseInt(argv.poll || '5', 10);
const { db } = require('../firebaseAdmin');

let lastSeen = { promotion_tasks: {}, platform_posts: {}, notifications: {} };

function idKey(d) { return d.id || d.path || (d.ref && d.ref.path) || JSON.stringify(d).slice(0,12); }

async function pollOnce() {
  try {
    // promotion_tasks (recent)
    const tasksSnap = await db.collection('promotion_tasks').orderBy('createdAt','desc').limit(50).get();
    const tasks = (tasksSnap.docs || []).map(d => ({ id: d.id, data: d.data() || {} }));
    for (const t of tasks.reverse()) { // older -> newer
      const key = t.id;
      const prev = lastSeen.promotion_tasks[key];
      const status = t.data.status || t.data.state || 'unknown';
      if (!prev) {
        console.log(`NEW TASK: ${key} platform=${t.data.platform||t.data.target_platforms||'?' } status=${status} createdAt=${t.data.createdAt||t.data.created_at||''}`);
        lastSeen.promotion_tasks[key] = { status, seenAt: Date.now() };
      } else if (prev.status !== status) {
        console.log(`TASK UPDATE: ${key} ${prev.status} -> ${status}`);
        lastSeen.promotion_tasks[key].status = status;
      }
    }

    // platform_posts (recent)
    const postsSnap = await db.collection('platform_posts').orderBy('createdAt','desc').limit(30).get();
    const posts = (postsSnap.docs || []).map(d => ({ id: d.id, data: d.data() || {} }));
    for (const p of posts.reverse()) {
      const key = p.id;
      const prev = lastSeen.platform_posts[key];
      const s = p.data.upload_status || p.data.status || 'unknown';
      if (!prev) {
        console.log(`NEW POST: ${key} platform=${p.data.platform||''} status=${s} url=${p.data.platform_post_url||p.data.share_url||''}`);
        lastSeen.platform_posts[key] = { status: s };
      } else if (prev.status !== s) {
        console.log(`POST UPDATE: ${key} ${prev.status} -> ${s} url=${p.data.platform_post_url||p.data.share_url||''} error=${p.data.error_message||''}`);
        lastSeen.platform_posts[key].status = s;
      }
    }

    // notifications (recent)
    const notifSnap = await db.collection('notifications').orderBy('createdAt','desc').limit(30).get();
    const notifs = (notifSnap.docs || []).map(d => ({ id: d.id, data: d.data() || {} }));
    for (const n of notifs.reverse()) {
      const key = n.id;
      if (!lastSeen.notifications[key]) {
        console.log(`NOTIFICATION: id=${key} user=${n.data.userId||n.data.uid||''} type=${n.data.type||''} title=${n.data.title||n.data.message||''}`);
        lastSeen.notifications[key] = true;
      }
    }

  } catch (err) {
    console.error('Watcher poll failed:', err && err.message ? err.message : err);
  }
}

(async function loop() {
  console.log(`Live watcher started (poll every ${pollSec}s). Waiting for new tasks/posts/notifications...`);
  await pollOnce();
  setInterval(pollOnce, Math.max(1000, pollSec*1000));
})();
