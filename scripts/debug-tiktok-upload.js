const express = require('express');
const bodyParser = require('body-parser');

// ensure mock env
process.env.TIKTOK_DEMO_MODE = '';

// require router (assumes modules are current)
delete require.cache[require.resolve('../src/routes/tiktokRoutes')];
const router = require('../src/routes/tiktokRoutes');
const request = require('supertest');
(async () => {
  const app = express();
  app.use(bodyParser.json());
  app.use('/', router);

  const res = await request(app)
    .post('/upload')
    .set('Authorization', 'Bearer test-token-for-user123')
    .send({ platform_options: { tiktok: { privacy: 'SELF_ONLY', consent: true } } });
  console.log('STATUS', res.status);
  console.log('BODY', res.body);
})();