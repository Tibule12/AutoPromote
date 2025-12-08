#!/usr/bin/env node
/*
 * Seed required documents in Firestore for cloud runs using service account json.
 * Usage: Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_ADMIN_SERVICE_ACCOUNT and run this script.
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

async function main(){
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT && !process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64) {
    console.warn('No service account configured. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_ADMIN_SERVICE_ACCOUNT* to run cloud seed.');
    process.exit(1);
  }
  // If FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64 is provided, write to a temp path and set GOOGLE_APPLICATION_CREDENTIALS
  let writtenPath = null;
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64) {
    try {
      const content = Buffer.from(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
      const tmpPath = path.resolve(__dirname, '..', 'test', 'e2e', 'tmp', 'service-account.json');
      fs.mkdirSync(path.dirname(tmpPath), { recursive: true });
      fs.writeFileSync(tmpPath, content, { encoding: 'utf8', mode: 0o600 });
      writtenPath = tmpPath;
      process.env.GOOGLE_APPLICATION_CREDENTIALS = tmpPath;
      console.log('Wrote service account to', tmpPath);
    } catch (e) {
      console.error('Failed to write service account from base64:', e.message);
      process.exit(1);
    }
  }

  // Initialize admin
  if (admin.apps.length === 0) {
    try {
      admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || undefined });
      console.log('Initialized firebase-admin for cloud seed');
    } catch (e) {
      console.error('Failed to init firebase-admin:', e.message);
      process.exit(1);
    }
  }
  const db = admin.firestore();
  const now = new Date().toISOString();
  console.log('Seeding cloud project =', process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'default');
  // Admin user
  await db.collection('admins').doc('adminUser123').set({ email: 'admin@example.com', name: 'Autopilot Admin', role: 'admin', createdAt: now }, { merge: true });
  await db.collection('users').doc('adminUser123').set({ email: 'admin@example.com', name: 'Autopilot Admin', role: 'admin', isAdmin: true, createdAt: now, lastAcceptedTerms: { version: process.env.REQUIRED_TERMS_VERSION || 'AUTOPROMOTE-v1.0', acceptedAt: now } }, { merge: true });

  // Test user
  await db.collection('users').doc('testUser123').set({ email: 'testuser@example.com', name: 'Test User', role: 'user', createdAt: now, lastAcceptedTerms: { version: process.env.REQUIRED_TERMS_VERSION || 'AUTOPROMOTE-v1.0', acceptedAt: now } }, { merge: true });

  // Content
  const contentRef = db.collection('content').doc('test-content-1');
  await contentRef.set({ title: 'Test Content for Autopilot', userId: 'testUser123', createdAt: now }, { merge: true });

  // AB test
  const abTestRef = db.collection('ab_tests').doc('test-autopilot-1');
  await abTestRef.set({ contentId: 'test-content-1', status: 'running', createdAt: now, variants: [ { id:'A', label: 'Variant A'}, { id:'B', label:'Variant B'} ], autopilot: { enabled: true, canary: { steps: 2, stepSize: 10 }, decisionCriteria: { metric: 'engagement', pThreshold: 0.95 } } }, { merge: true });

  // Variant metrics sample
  await db.collection('ab_test_variant_metrics').doc('test-autopilot-1').set({ variants: { A: { impressions: 100, conversions: 8 }, B: { impressions: 110, conversions: 12 } }, updatedAt: now }, { merge: true });

  console.log('✅ Cloud Firestore seeded successfully');
  if (writtenPath) {
    try { fs.unlinkSync(writtenPath); } catch (_) {}
  }
}

main().catch(e=>{ console.error(e && e.message || e); process.exit(1); });
