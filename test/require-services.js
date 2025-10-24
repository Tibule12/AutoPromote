process.env.FIREBASE_ADMIN_BYPASS='1';
const services = [
  '../src/services/spotifyService',
  '../src/services/redditService',
  '../src/services/discordService',
  '../src/services/linkedinService',
  '../src/services/telegramService',
  '../src/services/pinterestService',
  '../src/services/platformPoster',
];
(async () => {
  for (const s of services) {
    try {
      require(s);
      console.log('OK', s);
    } catch (e) {
      console.error('ERR', s, e && e.message ? e.message : e);
      process.exit(1);
    }
  }
  console.log('DONE');
})();
