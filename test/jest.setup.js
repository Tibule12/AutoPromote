// Jest setup to silence console logs during test runs to avoid "Cannot log after tests are done" errors
// Ensure test bypass variables are set early before any module imports
if (!process.env.FIREBASE_ADMIN_BYPASS) process.env.FIREBASE_ADMIN_BYPASS = '1';
if (!process.env.CI_ROUTE_IMPORTS) process.env.CI_ROUTE_IMPORTS = '1';
if (!process.env.NO_VIRAL_OPTIMIZATION) process.env.NO_VIRAL_OPTIMIZATION = '1';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'test';
// Helpful CI/testing defaults
if (!process.env.ALLOW_PAYMENTS_DEV_MOCK) process.env.ALLOW_PAYMENTS_DEV_MOCK = 'true';
if (!process.env.RATE_LIMIT_GLOBAL_MAX) process.env.RATE_LIMIT_GLOBAL_MAX = '1000';
if (!process.env.ENABLE_BACKGROUND_JOBS) process.env.ENABLE_BACKGROUND_JOBS = 'false';

if (!process.env.DEBUG_TEST_LOGS) {
  const originalLog = console.log;

// Global teardown for long-lived agents and resources that tests may leave open
try {
  const ka = require('../src/utils/keepAliveAgents');
  if (ka && typeof ka.destroy === 'function') {
    global.afterAll(async () => {
      try { ka.destroy(); } catch(e) { /* ignore */ }
    });
  }
} catch(e) { /* not present in some test environments */ }
// Also try to terminate any DB clients created by firebaseAdmin shims
try {
  const fb = require('../src/firebaseAdmin');
  if (fb && fb.db && typeof fb.db.terminate === 'function') {
    global.afterAll(async () => {
      try { await fb.db.terminate(); } catch(e) { /* ignore */ }
      try { if (fb.admin && typeof fb.admin.app === 'function') await fb.admin.app().delete(); } catch(e) { /* ignore */ }
    });
  }
} catch(e) { /* no-op */ }
  const originalWarn = console.warn;
  const originalError = console.error;
  // Replace console methods with no-ops; restore at process exit
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};
  process.on('exit', () => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  });
}

// If in test bypass mode, ensure firebaseAdmin admin.auth is a simple verifier that maps
// `test-token-for-<uid>` into { uid: '<uid>' } for tests relying on Authorization headers.
try {
  if (process.env.FIREBASE_ADMIN_BYPASS === '1' || process.env.CI_ROUTE_IMPORTS === '1' || process.env.NODE_ENV === 'test') {
    const fbAdmin = require('../src/firebaseAdmin');
    if (fbAdmin && fbAdmin.admin && typeof fbAdmin.admin.auth === 'function') {
      fbAdmin.admin.auth = () => ({ verifyIdToken: async (token) => {
        if (!token) return { uid: 'stub-uid' };
        const t = String(token);
        if (t.startsWith('test-token-for-')) return { uid: t.replace('test-token-for-','') };
        return { uid: 'stub-uid' };
      }, listUsers: async (n) => ({ users: [] }) });
    }
    // Seed minimal fake Firestore documents to ensure integration tests do not fail
    (async function seedTestDb() {
      try {
        const { db } = fbAdmin;
        const now = new Date().toISOString();
        // Ensure primary test user exists
        await db.collection('users').doc('testUser123').set({ email: 'testUser123@example.com', name: 'Test User', role: 'user', isAdmin: false, createdAt: now, lastAcceptedTerms: { version: process.env.REQUIRED_TERMS_VERSION || 'AUTOPROMOTE-v1.0', acceptedAt: now } }, { merge: true });
        // Ensure an admin user exists for admin endpoint tests
        await db.collection('admins').doc('adminUser').set({ email: 'adminUser@example.com', uid: 'adminUser', role: 'admin', isAdmin: true, createdAt: now }, { merge: true });
        // Some tests use adminUser123 as admin token
        await db.collection('admins').doc('adminUser123').set({ email: 'adminUser123@example.com', uid: 'adminUser123', role: 'admin', isAdmin: true, createdAt: now }, { merge: true });
        await db.collection('users').doc('adminUser').set({ email: 'adminUser@example.com', name: 'Admin', role: 'admin', isAdmin: true, createdAt: now, lastAcceptedTerms: { version: process.env.REQUIRED_TERMS_VERSION || 'AUTOPROMOTE-v1.0', acceptedAt: now } }, { merge: true });
        await db.collection('users').doc('adminUser123').set({ email: 'adminUser123@example.com', name: 'Admin 123', role: 'admin', isAdmin: true, createdAt: now, lastAcceptedTerms: { version: process.env.REQUIRED_TERMS_VERSION || 'AUTOPROMOTE-v1.0', acceptedAt: now } }, { merge: true });
        // Add leaderboard entry for testUser123 so leaderboard fetch returns at least one entry
        await db.collection('leaderboard').doc('testUser123').set({ userId: 'testUser123', score: 150, displayName: 'Test User' }, { merge: true });
        // Add a minimal content doc (id 12345) so analytics endpoints can return 200
        await db.collection('content').doc('12345').set({ title: 'Test Content', type: 'video', uid: 'testUser123', userId: 'testUser123', createdAt: now }, { merge: true });
        // Add basic connection docs for a few platforms (used by simulate tests)
        const platformConnections = ['spotify','discord','linkedin','pinterest'];
        for (const p of platformConnections) {
          await db.collection('users').doc('testUser123').collection('connections').doc(p).set({ connected: true, meta: { platform: p, display_name: 'TestUser' }, createdAt: now }, { merge: true });
        }
        // Clear any previous usage_ledger entries for the test user(s) to avoid rate-limit/usage failure
        try {
          const ledger = await db.collection('usage_ledger').where('userId', 'in', ['testUser123','adminUser','adminUser123']).get();
          const batch = db.batch ? db.batch() : null;
          if (ledger && ledger.forEach) {
            ledger.forEach(doc => {
              if (batch) batch.delete(doc.ref);
              else if (doc.ref && doc.ref.delete) doc.ref.delete();
            });
          }
          if (batch && batch.commit) await batch.commit();
        } catch (e) { if (process.env.DEBUG_TEST_LOGS === '1') console.warn('[jest.setup] Clearing usage_ledger failed:', e && e.message); }
      } catch (seedErr) {
        // Best-effort seeding; ignore failures under non-bypass mode or if DB not ready
        if (process.env.DEBUG_TEST_LOGS === '1') console.error('[jest.setup] DB seed failure:', seedErr && seedErr.message);
      }
    })().catch(err => { if (process.env.DEBUG_TEST_LOGS === '1') console.error('[jest.setup] DB seed async failure:', err && err.message); });
  }
} catch (e) { /* best-effort */ }
