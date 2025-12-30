// Script to debug tiktok upload handler with mocks
const express = require('express');
const bodyParser = require('body-parser');
const request = require('supertest');

// Insert mock firebaseAdmin into require cache
require.cache[require.resolve('../src/firebaseAdmin')] = {
  id: require.resolve('../src/firebaseAdmin'),
  filename: require.resolve('../src/firebaseAdmin'),
  loaded: true,
  exports: {
    admin: { firestore: { FieldValue: { serverTimestamp: () => Date.now() } } },
    db: {
      collection: name => {
        if (name === 'users') {
          return {
            doc: _id => ({
              collection: _sub => ({
                doc: _id2 => ({ get: async () => ({ exists: true, data: () => ({ tokens: { access_token: 'tok' }, open_id: 'openid-123' }) }) }),
              }),
            }),
          };
        }
        if (name === 'admin_audit') {
          return {
            where: () => ({ get: async () => ({ size: 0 }) }),
            add: async () => ({ id: 'audit-stub' }),
          };
        }
        return { where: () => ({ get: async () => ({ size: 0 }) }), add: async () => ({ id: 'stub' }) };
      }
    },
    auth: () => ({ verifyIdToken: async () => ({ uid: 'user123' }) }),
  }
};

// Mock safeFetch to return restricted privacy options
require.cache[require.resolve('../src/utils/ssrfGuard')] = {
  id: require.resolve('../src/utils/ssrfGuard'),
  filename: require.resolve('../src/utils/ssrfGuard'),
  loaded: true,
  exports: {
    safeFetch: async () => ({ ok: true, json: async () => ({ data: { privacy_level_options: ['EVERYONE'] } }) }),
  }
};

// Now require router
delete require.cache[require.resolve('../src/routes/tiktokRoutes')];
const router = require('../src/routes/tiktokRoutes');

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