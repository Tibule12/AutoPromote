// run-weekly-leaderboard.js
// Script to be run by cron/scheduler every week (e.g. Sunday at midnight)
// Usage: node scripts/run-weekly-leaderboard.js

require('dotenv').config();
const { publishWeeklyLeaderboard } = require('../src/services/communityEngine');

async function main() {
  console.log('Starting Weekly Leaderboard Job...');
  try {
    const result = await publishWeeklyLeaderboard();
    if (result && result.success) {
      console.log('✅ Leaderboard published successfully');
    } else if (result && result.skipped) {
      console.log('⚠️ Process skipped (check configuration)');
    } else {
      console.error('❌ Failed to publish leaderboard', result);
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  }
}

main();
