// Debug script to call admin sponsor approval endpoint and show response
// Use FIREBASE_ADMIN_BYPASS to run against test DB behavior without GCP creds
process.env.FIREBASE_ADMIN_BYPASS = '1';
const express = require('express');
const request = require('supertest');
const sponsorRoutes = require('../src/routes/adminSponsorApprovalRoutes');
const { db } = require('../src/firebaseAdmin');

async function main(){
  // Create a sponsor_approval doc for debugging
  const aRef = await db.collection('sponsor_approvals').add({
    contentId: 'debug-content-1',
    platform: 'youtube',
    sponsor: 'DebugCo',
    status: 'pending',
    requestedBy: 'debug-user',
    requestedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
  const id = aRef.id;
  console.log('Created debug sponsor_approval', id);
  const app = express();
  app.use(express.json());
  app.use((req,res,next)=>{ req.user = { uid: 'admin-1', isAdmin: true }; next(); });
  app.use('/api/admin/sponsor-approvals', sponsorRoutes);

  const res = await request(app).post(`/api/admin/sponsor-approvals/${id}/approve`).send({ notes: 'debug' });
  console.log('STATUS', res.statusCode);
  console.log('BODY', res.body);
  process.exit(0);
}

main().catch(e=>{console.error('ERR', e && e.message); console.error(e && e.stack); process.exit(1);});