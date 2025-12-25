// Minimal stub for server-side firebaseAdmin used in tests
// Tests will override `db.collection` as needed in beforeEach
module.exports = {
  admin: {
    auth: () => ({
      verifyIdToken: async t => ({ uid: "test-user" }),
    }),
  },
  db: {
    collection: name => ({
      doc: id => ({
        get: async () => ({ exists: false, data: () => ({}) }),
        set: async () => true,
        update: async () => true,
      }),
    }),
  },
};
