process.env.NODE_ENV = 'test';
const request = require('supertest');
const express = require('express');
const { db } = require('../src/firebaseAdmin');
const userRoutes = require('../src/userRoutes');

async function run() {
  const uid = 'test-kyc-user';
  await db.collection('users').doc(uid).set({ email: 'kyc@example.com', name: 'KYC User' });

  const app = express();
  app.use(express.json());
  // attach user stub
  app.use((req, res, next) => {
    req.user = { uid, email: 'kyc@example.com', role: 'user' };
    req.userId = uid;
    next();
  });
  app.use('/api/users', userRoutes);

  console.log('Starting start request');
  const start = await request(app).post('/api/users/me/kyc/start').send();
  console.log('start status', start.status, start.body);
  const token = start.body.attestationToken;

  console.log('Calling attest with token', token);
  const attest = await request(app).post('/api/users/me/kyc/attest').send({ attestationToken: token });
  console.log('attest status', attest.status, attest.body);

  console.log('Calling provider callback');
  const cb = await request(app)
    .post('/api/users/me/kyc/provider/callback')
    .send({ attestationToken: token, providerSessionId: 'sess-1', providerPayload: {} });
  console.log('provider callback status', cb.status, cb.body);
}

run().catch(e => { console.error(e); process.exit(1); });
