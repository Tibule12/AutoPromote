// Placeholder for firebaseAdmin.js
// Add Firebase Admin SDK initialization logic here

// Lightweight bypass support: when running tests or with the bypass env
// set, export lightweight in-memory stubs to avoid needing real
// credentials or writable firebase-admin namespace properties.
const bypass = process.env.CI_ROUTE_IMPORTS === '1' || process.env.FIREBASE_ADMIN_BYPASS === '1' || process.env.NODE_ENV === 'test' || typeof process.env.JEST_WORKER_ID !== 'undefined';
if (bypass) {
  // Minimal in-memory firestore stub
  const crypto = require('crypto');
  const __inMemoryDB = new Map();
  // Expose shared in-memory DB globally so src/firebaseAdmin.js and other modules
  // that also create a stub can reuse the same store during test bypass.
  try {
    global.__AUTOPROMOTE_IN_MEMORY_DB = __inMemoryDB;
  } catch (_) {}
  const CollectionStub = function(name) { this._name = name || 'collection'; };
  CollectionStub.prototype.doc = function(id) {
    const _id = id || ('stub-' + (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(4).toString('hex')));
    const fullPath = `${this._name}/${_id}`;
    return {
      id: _id,
      set: async (data, opt) => { const existing = __inMemoryDB.get(fullPath) || { id: _id, data: {} }; if (opt && opt.merge) { existing.data = { ...(existing.data||{}), ...(data||{}) }; __inMemoryDB.set(fullPath, existing); } else { __inMemoryDB.set(fullPath, { id: _id, data: data||{} }); } return true; },
      get: async () => { const doc = __inMemoryDB.get(fullPath); if (doc) return { exists: true, data: () => (doc.data||{}) }; return { exists: false, data: () => ({}) }; },
      update: async (data) => { const existing = __inMemoryDB.get(fullPath) || { id: _id, data: {} }; existing.data = { ...(existing.data||{}), ...(data||{}) }; __inMemoryDB.set(fullPath, existing); return true; },
      delete: async () => { __inMemoryDB.delete(fullPath); return true; },
      collection: (sub) => new CollectionStub(`${fullPath}/` + (sub||'child'))
    };
  };
  CollectionStub.prototype.add = async function(data) { const id = 'stub-' + (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(5).toString('hex')); const fullPath = `${this._name}/${id}`; __inMemoryDB.set(fullPath, { id, data: data||{} }); return { id, get: async () => ({ exists: true, data: () => (data||{}) }) }; };

  const firestoreStub = () => ({ collection: (name) => new CollectionStub(name) });

  // Provide minimal FieldValue/Timestamp helpers expected by code/tests
  firestoreStub.FieldValue = { serverTimestamp: () => new Date(), delete: () => null };
  firestoreStub.Timestamp = {
    fromDate: d => (d instanceof Date ? d : new Date(d)),
    now: () => new Date(),
  };

  // Basic Query stub to support .where/.orderBy/.limit/.get used in tests
  function QueryStub(collPath) {
    this._collPath = collPath || "";
    this._wheres = [];
    this._order = null;
    this._limit = null;
  }
  QueryStub.prototype.where = function(field, op, value) {
    this._wheres.push({ field, op, value });
    return this;
  };
  QueryStub.prototype.orderBy = function(field) {
    this._order = field;
    return this;
  };
  QueryStub.prototype.limit = function(n) {
    this._limit = n;
    return this;
  };
  QueryStub.prototype.get = async function() {
    const docs = [];
    const prefix = this._collPath ? this._collPath + '/' : '';
    for (const [key, v] of __inMemoryDB.entries()) {
      if (!key.startsWith(prefix)) continue;
      const rel = key.slice(prefix.length);
      if (rel.includes('/')) continue;
      const data = v.data || {};
      let include = true;
      for (const w of this._wheres) {
        const val = data[w.field];
        if (w.op === '==' && val !== w.value) include = false;
        if (w.op === 'in' && (!Array.isArray(w.value) || !w.value.includes(val))) include = false;
        if (w.op === '>=' && !(typeof val === 'number' && val >= w.value)) include = false;
      }
      if (include) {
        const fullPath = prefix + rel;
        docs.push({ id: rel, data: () => data, ref: { path: fullPath } });
      }
    }
    if (this._order) {
      docs.sort((a, b) => {
        const av = a.data()[this._order] || 0;
        const bv = b.data()[this._order] || 0;
        return av > bv ? 1 : av < bv ? -1 : 0;
      });
    }
    if (this._limit) docs.splice(this._limit);
    return { empty: docs.length === 0, docs, size: docs.length, forEach: cb => docs.forEach(d => cb(d)) };
  };

  CollectionStub.prototype.get = async function() {
    return new QueryStub(this._name).get();
  };

  const admin = { apps: ['stub'], firestore: firestoreStub, auth: () => ({ verifyIdToken: async () => ({ uid: 'stub-uid' }), listUsers: async () => ({ users: [] }) }) };
  const db = admin.firestore();
  const auth = admin.auth();
  const storage = { bucket: () => ({ file: (p) => ({ name: p, async exists() { return [false]; }, async download() { throw new Error('Storage stub: no file'); }, async save(_buf) { return true; } }), async upload() { throw new Error('Storage stub: upload not implemented'); } }) };
  module.exports = { admin, db, auth, storage };
} else {
  const realAdmin = require('firebase-admin');

  // Initialize admin SDK as usual
  realAdmin.initializeApp({
    credential: realAdmin.credential.applicationDefault(),
    databaseURL: 'https://autopromote-cc6d3.firebaseio.com'
  });

  const db = realAdmin.firestore();
  db.settings({ ignoreUndefinedProperties: true });

  // Create a shallow wrapper object for `admin` so tests can override
  // `auth` and `storage` properties (the firebase-admin namespace's
  // properties are non-writable in some environments which breaks tests
  // that stub them). This wrapper proxies to realAdmin by default but
  // allows tests to set mocks by assigning `firebaseAdmin.admin.auth = ...`
  const admin = Object.create(realAdmin);

  // Provide writable auth and storage functions that default to the
  // real admin implementations but can be reassigned in tests.
  admin.auth = (...args) => realAdmin.auth(...args);
  admin.storage = realAdmin.storage ? (...args) => realAdmin.storage(...args) : undefined;

  // Export a dynamic `auth` getter so consumers that destructure `{ auth }`
  // will receive the current implementation (useful for test stubbing
  // when done before requiring other modules).
  Object.defineProperty(module.exports, 'auth', {
    configurable: true,
    enumerable: true,
    get() {
      return admin.auth();
    }
  });

  module.exports.admin = admin;
  module.exports.db = db;
}
