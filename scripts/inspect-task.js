/*
Inspect a promotion task, its platform_post, and related notifications.
Usage:
  node ./scripts/inspect-task.js --task=PJGooLPVlhSZQG0HZuN5 --post=youtube_44b1367...
*/
const argv = require('minimist')(process.argv.slice(2));
const { db } = require('../firebaseAdmin');

async function main() {
  try {
    const taskId = argv.task;
    const postId = argv.post;
    if (!taskId && !postId) {
      console.log('Provide --task or --post');
      process.exit(1);
    }

    if (taskId) {
      const ref = db.collection('promotion_tasks').doc(taskId);
      const snap = await ref.get();
      if (!snap.exists) {
        console.log('Task not found:', taskId);
      } else {
        console.log('--- TASK ---');
        console.log('id:', taskId);
        console.log(JSON.stringify(snap.data(), null, 2));
        // show related platform_post if any
        const q = await db.collection('platform_posts').where('taskId','==',taskId).limit(5).get();
        if (q && q.docs && q.docs.length) {
          console.log('\nRelated platform_posts:');
          for (const d of q.docs) console.log(d.id, JSON.stringify(d.data(), null, 2));
        } else {
          console.log('\nNo platform_posts found referencing this taskId');
        }

        // check for notifications to the user mentioned in task
        const uid = snap.data().userId || snap.data().uid || snap.data().user || null;
        if (uid) {
          const n = await db.collection('notifications').where('userId','==',uid).orderBy('createdAt','desc').limit(10).get();
          console.log('\nRecent notifications for user', uid, ':', n.size || 0);
          for (const doc of (n.docs || [])) console.log(doc.id, JSON.stringify(doc.data(), null, 2));
        } else {
          console.log('\nNo userId found on task to fetch notifications');
        }
      }
    }

    if (postId) {
      const ref = db.collection('platform_posts').doc(postId);
      const snap = await ref.get();
      if (!snap.exists) {
        console.log('Post not found:', postId);
      } else {
        console.log('--- PLATFORM_POST ---');
        console.log('id:', postId);
        console.log(JSON.stringify(snap.data(), null, 2));
      }
    }

    process.exit(0);
  } catch (err) {
    console.error('inspect failed:', err && err.stack ? err.stack : err);
    process.exit(2);
  }
}

main();
