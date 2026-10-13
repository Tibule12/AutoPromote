#!/usr/bin/env node
// User-operated local sign-in and private, authenticated-only recovery snapshots.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const sessionDirectory = path.join(os.homedir(), '.local/share/autopromote-qa/session');
const sessionPath = path.join(sessionDirectory, 'studio-session.private.json');
const localOrigin = 'http://localhost:5000';

function encodedProperty(value, key) {
  return value?.o?.find(property => property.k === key)?.v;
}

function encodedString(value) {
  // Playwright's IndexedDB serializer retains primitive strings directly.
  return typeof value === 'string' ? value : typeof value?.s === 'string' ? value.s : '';
}

function authenticatedLocalState(state) {
  return (state?.origins || []).some(origin => origin.origin === localOrigin &&
    (origin.indexedDB || []).some(db => db.name === 'firebaseLocalStorageDb' &&
      (db.stores || []).some(store => store.name === 'firebaseLocalStorage' &&
        (store.records || []).some(record => {
          const user = record.value?.value;
          const encoded = record.valueEncoded;
          const encodedUser = encodedProperty(encoded, 'value');
          const encodedTokens = encodedProperty(encodedUser, 'stsTokenManager');
          const plain = user?.isAnonymous !== true && typeof record.value?.fbase_key === 'string' &&
            record.value.fbase_key.startsWith('firebase:authUser:') &&
            typeof user?.uid === 'string' && user.uid.length > 0 &&
            typeof user.stsTokenManager?.refreshToken === 'string' &&
            user.stsTokenManager.refreshToken.length > 0;
          const rich = encodedProperty(encodedUser, 'isAnonymous') !== true &&
            encodedString(encodedProperty(encoded, 'fbase_key')).startsWith('firebase:authUser:') &&
            encodedString(encodedProperty(encodedUser, 'uid')).length > 0 &&
            encodedString(encodedProperty(encodedTokens, 'refreshToken')).length > 0;
          return plain || rich;
        }))));
}

function mergeSessionRecovery(current, recovery) {
  if (!authenticatedLocalState(recovery)) throw new Error('Recovery copy has no refreshable local login.');
  if (authenticatedLocalState(current)) return current;
  const saved = recovery.origins.find(origin => origin.origin === localOrigin);
  const existing = current.origins?.find(origin => origin.origin === localOrigin);
  const localStorage = new Map((saved.localStorage || []).map(item => [item.name, item]));
  for (const item of existing?.localStorage || []) localStorage.set(item.name, item);
  // Restore only the actual saved login database. Preserve newer native project
  // stores and receipts; fill absent stores from the faithful recovery copy.
  const databases = new Map((saved.indexedDB || []).map(db => [db.name, db]));
  for (const db of existing?.indexedDB || []) {
    if (db.name !== 'firebaseLocalStorageDb') databases.set(db.name, db);
  }
  const cookies = new Map((recovery.cookies || []).map(cookie => [`${cookie.domain}:${cookie.path}:${cookie.name}`, cookie]));
  for (const cookie of current.cookies || []) cookies.set(`${cookie.domain}:${cookie.path}:${cookie.name}`, cookie);
  return {
    cookies: [...cookies.values()],
    origins: [...(current.origins || []).filter(origin => origin.origin !== localOrigin),
      { origin: localOrigin, localStorage: [...localStorage.values()], indexedDB: [...databases.values()] }],
  };
}

function writePrivateAtomic(filename, bytes) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(filename), 0o700);
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, filename);
    fs.chmodSync(filename, 0o600);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}

function saveAuthenticatedState(state, filename = sessionPath) {
  const local = {
    cookies: (state.cookies || []).filter(cookie => cookie.domain === 'localhost'),
    origins: (state.origins || []).filter(origin => origin.origin === localOrigin),
  };
  if (!authenticatedLocalState(local)) throw new Error('Signed-out or incomplete session refused; previous recovery copy preserved.');
  if (fs.existsSync(filename)) {
    const previous = fs.readFileSync(filename);
    if (authenticatedLocalState(JSON.parse(previous))) writePrivateAtomic(`${filename}.previous`, previous);
  }
  writePrivateAtomic(filename, JSON.stringify(local));
  return filename;
}

async function openManualSignIn() {
  const { chromium } = require('playwright');
  const profile = process.env.STUDIO_QA_PROFILE ||
    path.join(os.homedir(), '.cache/autopromote-materials-auth-audit-20261010');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chrome', headless: false, args: ['--mute-audio'],
    viewport: { width: 1400, height: 900 },
  });
  if (fs.existsSync(sessionPath)) {
    const current = await context.storageState({ indexedDB: true });
    if (!authenticatedLocalState(current)) {
      await context.setStorageState(mergeSessionRecovery(current, JSON.parse(fs.readFileSync(sessionPath))));
      console.log('Restored the actual retained session before sign-in; existing project stores preserved.');
    }
  }
  const page = context.pages()[0] || await context.newPage();
  await page.goto(localOrigin);
  await page.bringToFront();
  const signIn = page.getByRole('button', { name: 'Sign In', exact: true });
  if (await signIn.isVisible()) await signIn.click();
  console.log('Manual sign-in window opened at http://localhost:5000. No automatic QA is running.');
  let saved = false;
  let lastSave = 0;
  let lastError = '';
  context.on('close', () => { console.log(saved ? 'Manual window closed; private session retained.' : 'Manual window closed before a valid session was saved.'); });
  while (!page.isClosed()) {
    if (await page.getByRole('button', { name: 'Viral Clip Studio', exact: true }).isVisible().catch(() => false)) {
      if (Date.now() - lastSave > 30000) {
        try {
          saveAuthenticatedState(await context.storageState({ indexedDB: true }));
          if (!saved) {
            const persisted = await page.evaluate(() => navigator.storage?.persist?.() || false).catch(() => false);
            writePrivateAtomic(path.join(sessionDirectory, 'session-status.json'), JSON.stringify({
              savedAt: new Date().toISOString(), profile, recoveryPath: sessionPath,
              authenticated: true, persistenceGranted: persisted,
              note: 'Refreshable browser session; no password stored by this script. Revocation and expiry still apply.',
            }, null, 2));
            console.log('Authenticated localhost session saved privately. Signed-out snapshots cannot overwrite it.');
          }
          saved = true; lastSave = Date.now();
        } catch (error) {
          if (lastError !== error.message) console.log(error.message);
          lastError = error.message; lastSave = Date.now();
        }
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

module.exports = { authenticatedLocalState, saveAuthenticatedState, mergeSessionRecovery, sessionPath };
if (require.main === module) openManualSignIn().catch(error => { console.error(error.message); process.exitCode = 1; });
