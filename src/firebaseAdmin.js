 
// Lightweight test bypass: when CI_ROUTE_IMPORTS=1 (route import tests) or FIREBASE_ADMIN_BYPASS=1
// we avoid real Firebase initialization and return in-memory stubs.
// When running under jest/CI or with bypass envs, avoid initializing actual Firebase Admin
const bypass =
  process.env.CI_ROUTE_IMPORTS === "1" ||
  process.env.FIREBASE_ADMIN_BYPASS === "1" ||
  process.env.NODE_ENV === "test" ||
  typeof process.env.JEST_WORKER_ID !== "undefined";
if (process.env.DEBUG_FIREBASE_ADMIN === "1") {
  try {
    console.log(
      "[firebaseAdmin] bypass?:",
      bypass,
      "CI_ROUTE_IMPORTS",
      process.env.CI_ROUTE_IMPORTS,
      "FIREBASE_ADMIN_BYPASS",
      process.env.FIREBASE_ADMIN_BYPASS,
      "JEST_WORKER_ID",
      process.env.JEST_WORKER_ID
    );
  } catch (_) {}
}

if (bypass) {
  // In bypass mode, create minimal stubs for testing
  const QueryStub = function (collPath) {
    this._collPath = collPath || "";
    this._wheres = [];
    this._order = null;
    this._limit = null;
  };
  QueryStub.prototype.where = function (field, op, value) {
    this._wheres.push({ field, op, value });
    return this;
  };
  QueryStub.prototype.orderBy = function (field) {
    this._order = field;
    return this;
  };
  QueryStub.prototype.limit = function (n) {
    this._limit = n;
    return this;
  };
  QueryStub.prototype.count = function () {
    const self = this;
    return {
      get: async function () {
        const snap = await self.get();
        return {
          data: () => ({ count: snap.size }),
        };
      },
    };
  };
  QueryStub.prototype.get = async function () {
    const docs = [];
    const prefix = this._collPath ? this._collPath + "/" : "";
    for (const [key, v] of __inMemoryDB.entries()) {
      if (!key.startsWith(prefix)) continue;
      // Only direct children (do not include nested collection docs)
      const rel = key.slice(prefix.length);
      if (rel.includes("/")) continue;
      const data = v.data || {};
      let include = true;
      for (const w of this._wheres) {
        const val = data[w.field];
        if (w.op === "==" && val !== w.value) include = false;
        if (w.op === "in" && (!Array.isArray(w.value) || !w.value.includes(val))) include = false;
        if (w.op === ">=" && !(typeof val === "number" && val >= w.value)) include = false;
      }
      if (include) {
        const fullPath = prefix + rel;
        const docRef = {
          path: fullPath,
          id: rel,
          update: async newData => {
            const existing = __inMemoryDB.get(fullPath) || { id: rel, data: {} };
            existing.data = { ...(existing.data || {}), ...(newData || {}) };
            __inMemoryDB.set(fullPath, existing);
            return true;
          },
          set: async (newData, opt) => {
            if (opt && opt.merge) {
              const existing = __inMemoryDB.get(fullPath) || { id: rel, data: {} };
              existing.data = { ...(existing.data || {}), ...(newData || {}) };
              __inMemoryDB.set(fullPath, existing);
            } else {
              __inMemoryDB.set(fullPath, { id: rel, data: newData || {} });
            }
            return true;
          },
          get: async () => {
            const d = __inMemoryDB.get(fullPath);
            if (d) return { exists: true, data: () => d.data || {} };
            return { exists: false, data: () => ({}) };
          },
        };
        docs.push({ id: rel, data: () => data, ref: docRef });
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
    return {
      empty: docs.length === 0,
      docs,
      size: docs.length,
      forEach: cb => docs.forEach(d => cb({ id: d.id, data: () => d.data() })),
    };
  };

  // Global in-memory store for bypass mode to persist simple doc sets between operations
  // Reuse any global store created by the top-level firebaseAdmin.js to keep a single
  // in-memory DB across modules (avoid duplicate stores when different files require different stubs).
  const __inMemoryDB =
    global.__AUTOPROMOTE_IN_MEMORY_DB || (global.__AUTOPROMOTE_IN_MEMORY_DB = new Map());
  const CollectionStub = function (name) {
    this._name = name || "collection";
  };
  const crypto = require("crypto");
  CollectionStub.prototype.doc = function (id) {
    const _id =
      id ||
      "stub-" + (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(4).toString("hex"));
    const fullPath = `${this._name}/${_id}`;
    return {
      path: fullPath,
      id: _id,
      set: async (data, opt) => {
        const existing = __inMemoryDB.get(fullPath) || { id: _id, data: {} };
        if (opt && opt.merge) {
          existing.data = { ...(existing.data || {}), ...(data || {}) };
          existing.updatedAt = new Date().toISOString();
          __inMemoryDB.set(fullPath, existing);
        } else {
          __inMemoryDB.set(fullPath, {
            id: _id,
            data: data || {},
            updatedAt: new Date().toISOString(),
          });
        }
        return true;
      },
      get: async () => {
        const doc = __inMemoryDB.get(fullPath);
        if (doc) return { exists: true, data: () => doc.data || {} };
        return { exists: false, data: () => ({}) };
      },
      update: async data => {
        const existing = __inMemoryDB.get(fullPath) || { id: _id, data: {} };
        existing.data = { ...(existing.data || {}), ...(data || {}) };
        __inMemoryDB.set(fullPath, existing);
        return true;
      },
      delete: async () => {
        __inMemoryDB.delete(fullPath);
        return true;
      },
      collection: sub => new CollectionStub(`${fullPath}/` + (sub || "child")),
    };
  };
  CollectionStub.prototype.add = async function (data) {
    const id =
      "stub-" + (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(5).toString("hex"));
    const fullPath = `${this._name}/${id}`;
    __inMemoryDB.set(fullPath, { id, data: data || {}, updatedAt: new Date().toISOString() });
    return {
      id,
      get: async () => ({ exists: true, data: () => data || {} }),
      update: async () => {},
      set: async () => {},
      collection: () => new CollectionStub(),
    };
  };
  CollectionStub.prototype.limit = function (n) {
    return new QueryStub(this._name).limit(n);
  };
  CollectionStub.prototype.where = function (field, op, value) {
    return new QueryStub(this._name).where(field, op, value);
  };
  CollectionStub.prototype.orderBy = function (field) {
    return new QueryStub(this._name).orderBy(field);
  };
  CollectionStub.prototype.get = async function () {
    return new QueryStub(this._name).get();
  };

  const firestoreStub = () => {
    const instance = {
      collection: name => new CollectionStub(name),
    };
    // Minimal batch implementation to support code paths that call db.batch()
    instance.batch = function () {
      const ops = [];
      function pathOf(ref) {
        if (!ref) return null;
        if (typeof ref === "string") return ref;
        if (ref.path) return ref.path;
        if (ref._path) return ref._path;
        return null;
      }
      return {
        delete(ref) {
          ops.push({ op: "delete", ref: pathOf(ref) });
        },
        set(ref, data) {
          ops.push({ op: "set", ref: pathOf(ref), data });
        },
        update(ref, data) {
          ops.push({ op: "update", ref: pathOf(ref), data });
        },
        async commit() {
          for (const o of ops) {
            if (!o.ref) continue;
            if (o.op === "delete") {
              __inMemoryDB.delete(o.ref);
            } else if (o.op === "set") {
              __inMemoryDB.set(o.ref, { id: o.ref.split("/").pop(), data: o.data || {} });
            } else if (o.op === "update") {
              const existing = __inMemoryDB.get(o.ref) || { id: o.ref.split("/").pop(), data: {} };
              existing.data = { ...(existing.data || {}), ...(o.data || {}) };
              __inMemoryDB.set(o.ref, existing);
            }
          }
          return Promise.resolve();
        },
      };
    };
    return instance;
  };
  // Minimal Timestamp/FieldValue shims
  firestoreStub.FieldValue = { serverTimestamp: () => new Date(), delete: () => null };
  firestoreStub.Timestamp = {
    fromDate: d => (d instanceof Date ? d : new Date(d)),
    now: () => new Date(),
  };

  const admin = {
    apps: ["stub"],
    firestore: firestoreStub,
    auth: () => ({ verifyIdToken: async () => ({ uid: "stub-uid" }) }),
  };
  const db = admin.firestore();
  // Minimal auth stub (verifyIdToken used by auth middleware)
  const auth = admin.auth();
  // Minimal storage stub so modules that call storage.bucket() won't crash in bypass mode
  const storage = {
    bucket: () => ({
      file: p => ({
        name: p,
        async exists() {
          return [false];
        },
        async download() {
          throw new Error("Storage stub: no file");
        },
        async save(_buf) {
          return true;
        },
      }),
      async upload() {
        throw new Error("Storage stub: upload not implemented");
      },
    }),
  };

  module.exports = { admin, db, auth, storage };
} else {
  // When not bypassing, try to use root firebaseAdmin module first
  try {
    module.exports = require("../firebaseAdmin");
  } catch (e) {
    // Fall back to local initialization if root module not available
    console.warn(
      "[firebaseAdmin shim] Root firebaseAdmin.js not found, using local init:",
      e.message
    );

    const admin = require("firebase-admin");
    const adminConfig = require("../firebaseConfig.server.js");

    if (admin.apps.length === 0) {
      // Validate minimal required fields
      const required = ["project_id", "private_key", "client_email"];
      const missing = required.filter(
        k => !adminConfig[k] || typeof adminConfig[k] !== "string" || !adminConfig[k].trim()
      );
      if (missing.length) {
        throw new Error(
          `Firebase Admin missing required fields: ${missing.join(", ")}. Provide either FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_BASE64 or individual FIREBASE_* vars.`
        );
      }
      try {
        // Fix for gRPC/Render recursion crash: disable telemetry BEFORE initializing admin
        process.env.GOOGLE_CLOUD_DISABLE_GRPC_GCP_OBSERVABILITY = "true";
        process.env.OTEL_SDK_DISABLED = "true";
        process.env.OTEL_TRACES_EXPORTER = "none";

        admin.initializeApp({
          credential: admin.credential.cert(adminConfig),
          databaseURL: process.env.FIREBASE_DATABASE_URL || "",
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
          projectId: process.env.FIREBASE_PROJECT_ID || adminConfig.project_id,
        });

        // Extra aggressive: Try to patch admin.firestore() to disable settings if possible
        try {
          const setup = admin.firestore();
          setup.settings({ ignoreUndefinedProperties: true });
        } catch (_) {}

        console.log("✅ Firebase Admin initialized with server config");
      } catch (initError) {
        console.error("[firebaseAdmin] Initialization failed:", initError.message);
        throw initError;
      }
    }

    const db = admin.firestore();
    const auth = admin.auth ? admin.auth() : null;
    let storage = null;
    try {
      storage = admin.storage ? admin.storage() : null;
    } catch (_) {
      storage = null;
    }
    module.exports = { admin, db, auth, storage };
  }
}
