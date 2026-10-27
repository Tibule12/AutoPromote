const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  increment,
  serverTimestamp,
  writeBatch,
} = require("firebase/firestore");
const { Firestore, FieldValue } = require("firebase-admin/firestore");
const express = require("express");
const request = require("supertest");

const PROJECT = "demo-autopromote-security";
assert.equal(process.env.SECURITY_TEST_PROJECT, PROJECT);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || "", /^127\.0\.0\.1:[0-9]+$/);
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(":");
const db = new Firestore({
  projectId: PROJECT,
  host: process.env.FIRESTORE_EMULATOR_HOST,
  ssl: false,
});
let environment;
const root = path.resolve(__dirname, "../..");
const productionOwnerUid = require("../../src/config/trustedAdminPolicy.json").trustedAdminUids[0];
// Keep the real policy logic, substituting only a local fixture's UID.
const candidateRules = () =>
  fs
    .readFileSync(path.join(root, "config/security/firestore.owner-scoped.rules"), "utf8")
    .replaceAll(productionOwnerUid, "trusted");
const seed = async (collection, id, data) => db.collection(collection).doc(id).set(data);
const owner = () =>
  environment.authenticatedContext("alice", { email: "alice@example.test" }).firestore();
const financial = {
  credits: 31,
  balance: 12,
  aiCredits: 7,
  growth_credits: 8,
  subscriptionTier: "pro",
  subscriptionStatus: "active",
  plan: { tier: "pro" },
  testerAccess: { status: "active", creditsUsed: 3 },
  role: "user",
  isAdmin: false,
};

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: {
      host,
      port: Number(port),
      rules: candidateRules(),
    },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await seed("users", "alice", { name: "Alice", email: "alice@example.test", ...financial });
});
after(async () => {
  await environment?.cleanup();
  await db.terminate();
});

describe("before-repair reproduction, only inside the demo emulator", () => {
  it("reproduces credit/tier tampering and cross-collection admin escalation with the old rules", async () => {
    await initializeTestEnvironment({
      projectId: PROJECT,
      firestore: {
        host,
        port: Number(port),
        rules: fs.readFileSync(path.join(__dirname, "fixtures/firestore.before.rules"), "utf8"),
      },
    }).then(async baseline => {
      try {
        const alice = baseline.authenticatedContext("alice").firestore();
        await assertSucceeds(
          updateDoc(doc(alice, "users/alice"), {
            credits: 999999,
            subscriptionTier: "enterprise",
            role: "admin",
          })
        );
        await assertSucceeds(setDoc(doc(alice, "admins/alice"), { role: "admin" }));
        await assertSucceeds(setDoc(doc(alice, "user_credits/bob"), { balance: 999999 }));
        assert.equal((await db.collection("user_credits").doc("bob").get()).data().balance, 999999);
      } finally {
        await baseline.cleanup();
        await initializeTestEnvironment({
          projectId: PROJECT,
          firestore: {
            host,
            port: Number(port),
            rules: candidateRules(),
          },
        }).then(env => env.cleanup());
      }
    });
  });
  it("checks emergency fallback denial while trusted server billing remains available", async () => {
    const isolated = await initializeTestEnvironment({
      projectId: PROJECT,
      firestore: {
        host,
        port: Number(port),
        rules: fs.readFileSync(
          path.join(root, "config/security/firestore.restrictive-fallback.rules"),
          "utf8"
        ),
      },
    });
    try {
      await assertFails(
        getDoc(doc(isolated.authenticatedContext("alice").firestore(), "users/alice"))
      );
      await assertFails(
        setDoc(
          doc(isolated.authenticatedContext("trusted", { admin: true }).firestore(), "admins/new"),
          { role: "admin" }
        )
      );
      await db.runTransaction(async tx => {
        const ref = db.collection("users").doc("alice");
        await tx.get(ref);
        tx.update(ref, { credits: 32 });
      });
      assert.equal((await db.collection("users").doc("alice").get()).data().credits, 32);
    } finally {
      await isolated.cleanup();
      const restored = await initializeTestEnvironment({
        projectId: PROJECT,
        firestore: {
          host,
          port: Number(port),
          rules: candidateRules(),
        },
      });
      await restored.cleanup();
    }
  });
});

describe("repaired user-profile rules", () => {
  it("preserves legitimate profile preferences and every financial field", async () => {
    await assertSucceeds(
      updateDoc(doc(owner(), "users/alice"), {
        name: "New name",
        timezone: "Africa/Johannesburg",
        notifications: { email: { weeklyDigest: true } },
        schedulingDefaults: { platforms: ["youtube"] },
        autoRepostEnabled: false,
        paypalEmail: "payout@example.test",
        avatarUrl: "https://example.test/avatar.png",
        updatedAt: serverTimestamp(),
      })
    );
    const stored = (await db.collection("users").doc("alice").get()).data();
    for (const [key, value] of Object.entries(financial)) assert.deepEqual(stored[key], value);
    assert.equal(stored.name, "New name");
  });
  for (const [field, value] of Object.entries({
    ...financial,
    credits: 999,
    balance: 999,
    aiCredits: 999,
    growth_credits: 999,
    subscriptionTier: "enterprise",
    subscriptionStatus: "cancelled",
    plan: { tier: "enterprise" },
    testerAccess: { status: "active", creditsUsed: 0 },
    role: "admin",
    isAdmin: true,
    admin: true,
    claims: { admin: true },
    customClaims: { admin: true },
    fromCollection: "admins",
    uid: "bob",
    uploadBlocked: false,
    emailVerified: true,
    kycStatus: "approved",
    aiSubscriptionEnd: 9999999999999,
  })) {
    it(`rejects owner modification of ${field}`, async () => {
      await assertFails(updateDoc(doc(owner(), "users/alice"), { [field]: value }));
    });
  }
  it("rejects numeric transforms, protected-field removal, document replacement and deletion", async () => {
    const ref = doc(owner(), "users/alice");
    await assertFails(updateDoc(ref, { credits: increment(1) }));
    await assertFails(updateDoc(ref, { credits: deleteField() }));
    await assertFails(setDoc(ref, { name: "Erased account" }));
    await assertFails(deleteDoc(ref));
  });
  it("rejects nested entitlement changes and a mixed profile/privilege update atomically", async () => {
    await assertFails(updateDoc(doc(owner(), "users/alice"), { "testerAccess.creditsUsed": 0 }));
    await assertFails(updateDoc(doc(owner(), "users/alice"), { name: "Forged", role: "admin" }));
    assert.equal((await db.collection("users").doc("alice").get()).data().name, "Alice");
  });
  it("allows safe profile creation but rejects initial financial fields and backdated creation", async () => {
    const client = environment.authenticatedContext("new-user").firestore();
    await assertFails(setDoc(doc(client, "users/new-user"), { role: "admin", credits: 100 }));
    await assertFails(
      setDoc(doc(client, "users/new-user"), { name: "Name", createdAt: new Date("2000-01-01") })
    );
    await assertSucceeds(
      setDoc(doc(client, "users/new-user"), { name: "Name", createdAt: serverTimestamp() })
    );
    await assertFails(
      updateDoc(doc(client, "users/new-user"), { createdAt: new Date("2000-01-01") })
    );
  });
  it("denies anonymous and cross-account access", async () => {
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), "users/alice")));
    await assertFails(
      updateDoc(doc(environment.authenticatedContext("bob").firestore(), "users/alice"), {
        name: "Forged",
      })
    );
  });
  it("does not trust existing forged admin flags or a batch creating an admin record", async () => {
    await seed("users", "alice", { ...financial, role: "admin", isAdmin: true, admin: true });
    await assertFails(setDoc(doc(owner(), "admins/alice"), { role: "admin" }));
    await assertFails(setDoc(doc(owner(), "user_credits/alice"), { balance: 999 }));
    const client = owner(),
      batch = writeBatch(client);
    batch.set(doc(client, "admins/alice"), { role: "admin" });
    batch.set(doc(client, "payments/fake"), { status: "COMPLETE" });
    await assertFails(batch.commit());
  });
  it("preserves the reviewed owner while quarantining historical claims and admin documents", async () => {
    for (const claims of [{ admin: true }, { isAdmin: true }, { role: "admin" }]) {
      await assertSucceeds(
        setDoc(
          doc(environment.authenticatedContext("trusted", claims).firestore(), "analytics/test"),
          { ok: true }
        )
      );
    }
    await seed("admins", "legacy-admin", { role: "admin" });
    await assertFails(
      getDoc(doc(environment.authenticatedContext("legacy-admin").firestore(), "users/alice"))
    );
    await assertFails(
      setDoc(
        doc(
          environment
            .authenticatedContext("unreviewed", { admin: true, role: "admin" })
            .firestore(),
          "analytics/forged"
        ),
        { ok: true }
      )
    );
    await assertSucceeds(
      setDoc(
        doc(
          environment.authenticatedContext("trusted").firestore(),
          "analytics/owner-without-legacy-claim"
        ),
        { ok: true }
      )
    );
    await assertFails(
      getDoc(
        doc(
          environment.authenticatedContext("impostor", { admin: "true" }).firestore(),
          "analytics/test"
        )
      )
    );
  });
  it("preserves existing server payment/subscription writes without changing client authority", async () => {
    // Admin SDK uses IAM and bypasses client rules; these are only demo fixture writes.
    await db.runTransaction(async tx => {
      tx.update(db.collection("users").doc("alice"), { credits: 81, subscriptionTier: "pro" });
      tx.set(db.collection("transactions").doc("paid-demo"), {
        userId: "alice",
        amount: "4.99",
        status: "COMPLETED",
      });
    });
    await assertSucceeds(getDoc(doc(owner(), "transactions/paid-demo")));
    await assertFails(updateDoc(doc(owner(), "transactions/paid-demo"), { amount: "0" }));
  });
  it("preserves owned content creation used by Clip Studio", async () => {
    await assertSucceeds(
      setDoc(doc(owner(), "content/clip-demo"), {
        userId: "alice",
        user_id: "alice",
        title: "My clip",
        sourceContext: "clip_studio",
      })
    );
  });
  it("preserves production's server-owned Studio model collections even for client admin claims", async () => {
    const trusted = environment.authenticatedContext("trusted", { admin: true }).firestore();
    for (const collection of [
      "studio_model_capability_jobs",
      "studio_model_capability_artifacts",
      "studio_model_capability_capacity",
      "studio_subject_vfx_jobs",
      "studio_subject_vfx_requests",
      "studio_subject_vfx_capacity",
    ]) {
      await assertFails(
        setDoc(doc(trusted, `${collection}/forged`), { ownerUid: "trusted", state: "paid" })
      );
      await assertFails(
        setDoc(doc(trusted, `${collection}/forged/receipts/nested`), { state: "paid" })
      );
      await seed(collection, "server", { state: "trusted" });
    }
  });
  it("preserves queued publishing schedule updates and owned content reads", async () => {
    const client = owner();
    await assertSucceeds(
      setDoc(doc(client, "promotion_schedules/owned"), {
        user_id: "alice",
        status: "scheduled",
        platform: "youtube",
        scheduledTime: "2026-10-27T12:00:00Z",
      })
    );
    await assertSucceeds(
      updateDoc(doc(client, "promotion_schedules/owned"), {
        scheduledTime: "2026-10-28T12:00:00Z",
      })
    );
    await seed("content", "published", {
      user_id: "alice",
      title: "Published title",
      metrics: { views: 12 },
    });
    await assertSucceeds(getDoc(doc(client, "content/published")));
    await assertSucceeds(updateDoc(doc(client, "content/published"), { title: "Revised title" }));
    await assertFails(updateDoc(doc(client, "content/published"), { "metrics.views": 999 }));
  });
  it("keeps workspace editor source creation and viewer reads working", async () => {
    await seed("workspaces/team/members", "alice", { role: "editor", status: "active" });
    await seed("workspaces/team/members", "viewer", { role: "viewer", status: "active" });
    await assertSucceeds(
      setDoc(doc(owner(), "content/team-source"), {
        workspace_id: "team",
        user_id: "alice",
        title: "Shared source",
      })
    );
    const viewer = environment.authenticatedContext("viewer").firestore();
    await assertSucceeds(getDoc(doc(viewer, "content/team-source")));
    await assertFails(
      setDoc(doc(viewer, "content/forged-team-source"), {
        workspace_id: "team",
        title: "Viewer cannot create",
      })
    );
  });
  it("rejects conflicting owner aliases when creating content", async () => {
    await assertFails(
      setDoc(doc(owner(), "content/conflict"), {
        userId: "victim",
        user_id: "alice",
        title: "Forged owner",
      })
    );
    await assertFails(
      setDoc(doc(owner(), "content/conflict"), {
        userId: "alice",
        user_id: "victim",
        title: "Forged owner",
      })
    );
  });
  it("prevents client-forged reward metrics, repeated bonus claims and ownership transfer", async () => {
    await assertFails(setDoc(doc(owner(), "content/forged"), { userId: "alice", views: 500000 }));
    await seed("content", "reward-source", {
      userId: "alice",
      user_id: "alice",
      title: "Clip",
      views: 500000,
      claimedBonuses: ["viral_tier_1"],
      metrics: { views: 500000 },
      revenue: 20,
    });
    for (const update of [
      { views: 999999 },
      { claimedBonuses: [] },
      { "metrics.views": 999999 },
      { revenue: 9999 },
      { userId: "bob" },
      { user_id: "bob" },
      { workspace_id: "other" },
    ]) {
      await assertFails(updateDoc(doc(owner(), "content/reward-source"), update));
    }
    await assertSucceeds(
      updateDoc(doc(owner(), "content/reward-source"), { title: "Edited title" })
    );
  });
  for (const collection of ["ads", "paid_boosts"]) {
    it(`preserves ${collection} owner reads but prevents forged paid state through direct client writes`, async () => {
      await seed(collection, "paid-demo", { userId: "alice", status: "pending", budget: 10 });
      await assertSucceeds(getDoc(doc(owner(), `${collection}/paid-demo`)));
      await assertFails(
        updateDoc(doc(owner(), `${collection}/paid-demo`), { status: "paid", budget: 999999 })
      );
      await assertFails(
        setDoc(doc(owner(), `${collection}/forged`), { userId: "alice", status: "paid" })
      );
      await assertFails(deleteDoc(doc(owner(), `${collection}/paid-demo`)));
    });
  }
  for (const collection of [
    "user_credits",
    "user_billing",
    "user_subscriptions",
    "credit_usage",
    "credit_charges",
    "credit_refunds",
    "credit_ledger",
    "payments",
    "payment_events",
    "paypal_webhook_events",
    "subscription_intents",
    "subscription_events",
    "subscription_refunds",
    "transactions",
    "usage_ledger",
    "payouts",
    "withdrawals",
    "reward_history",
    "redemption_history",
    "earnings_events",
    "referrals",
    "referral_invitations",
    "admins",
    "future_financial_collection",
  ]) {
    it(`denies direct financial/authority writes to ${collection}`, async () => {
      await assertFails(
        setDoc(doc(owner(), `${collection}/alice`), { userId: "alice", balance: 999 })
      );
    });
  }
});

// Mock only identity verification/provider delivery; the real Express handlers and
// real demo Firestore are exercised. Never import the application's production Admin app.
const revokedTokens = new Set();
const tokens = new Map(),
  accounts = new Map(),
  tokenMints = [],
  claimWrites = [];
const auth = {
  async verifyIdToken(token, checkRevoked) {
    assert.equal(checkRevoked, true, "authentication must enforce revocation");
    if (revokedTokens.has(token))
      throw Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" });
    if (!tokens.has(token)) throw new Error("invalid token");
    return tokens.get(token);
  },
  async getUser(uid) {
    if (!accounts.has(uid)) throw new Error("missing auth user");
    return accounts.get(uid);
  },
  async createUser(input) {
    if ([...accounts.values()].some(a => a.email === input.email))
      throw Object.assign(new Error("exists"), { code: "auth/email-already-exists" });
    const user = {
      uid: `new-${accounts.size}`,
      email: input.email,
      displayName: input.displayName,
      customClaims: {},
    };
    accounts.set(user.uid, user);
    return user;
  },
  async getUserByEmail(email) {
    return [...accounts.values()].find(a => a.email === email);
  },
  async updateUser(uid, changes) {
    const account = await this.getUser(uid);
    Object.assign(account, changes);
    return account;
  },
  async setCustomUserClaims(uid, claims) {
    claimWrites.push({ uid, claims });
  },
  async createCustomToken(uid, claims) {
    tokenMints.push({ uid, claims });
    return "mock-custom-token";
  },
  async generateEmailVerificationLink() {
    return "https://example.test/verification";
  },
};
function stub(relative, exports) {
  const filename = require.resolve(relative);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stub("../../src/config/trustedAdminPolicy.json", {
  version: "fixture-only",
  trustedAdminUids: ["trusted", "claim-admin", "member-admin"],
});
const firestore = Object.assign(() => db, { FieldValue });
const admin = { firestore, auth: () => auth };
stub("firebase-admin", admin);
stub("../../src/firebaseAdmin", { db, admin, auth });
stub("../../src/services/emailService", {
  sendVerificationEmail: async () => ({ ok: true, provider: "fixture" }),
  sendPasswordResetEmail: async () => ({ ok: true }),
});
stub("../../src/utils/simpleCache", { withCache: async (_key, _ttl, fn) => fn() });
stub("../../src/diagnostics", {
  isBlocked: () => false,
  incAuthFail: () => {},
  getIpCount: () => 0,
});
const authMiddleware = require("../../src/authMiddleware");
const authRoutes = require("../../src/authRoutes");
const userRoutes = require("../../src/userRoutes");
const adminOnly = require("../../src/middlewares/adminOnly");
const app = express();
app.use(express.json());
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.get("/identity", authMiddleware, (req, res) => res.json(req.user));
app.get("/admin", authMiddleware, adminOnly, (req, res) => res.json({ ok: true }));
app.use("/real-admin", require("../../src/adminRoutes"));
const ordinaryToken = "eyJ" + "x".repeat(150);
const claimsToken = "eyJ" + "a".repeat(150);
const memberToken = "eyJ" + "b".repeat(150);
function bearer(req, token = ordinaryToken) {
  return req.set("Authorization", `Bearer ${token}`);
}

describe("real authentication and registration handlers with isolated identity fixtures", () => {
  beforeEach(() => {
    tokens.clear();
    revokedTokens.clear();
    accounts.clear();
    tokenMints.length = 0;
    claimWrites.length = 0;
    tokens.set(ordinaryToken, { uid: "alice", email: "alice@example.test", role: "user" });
    tokens.set(claimsToken, { uid: "claim-admin", email: "admin@example.test", role: "admin" });
    tokens.set(memberToken, { uid: "member-admin", email: "member@example.test" });
    accounts.set("alice", {
      uid: "alice",
      email: "alice@example.test",
      displayName: "Alice",
      emailVerified: true,
      customClaims: { feature: "preserve" },
    });
  });
  it("blocks existing forged profile flags, nested claims and identity substitution", async () => {
    await seed("users", "alice", {
      ...financial,
      uid: "victim",
      id: "victim",
      userId: "victim",
      email: "victim@example.test",
      role: "user",
      isAdmin: true,
      admin: true,
      claims: { admin: true },
      customClaims: { admin: true },
      fromCollection: "admins",
      test: true,
    });
    const result = await bearer(request(app).get("/identity")).expect(200);
    assert.equal(result.body.uid, "alice");
    assert.equal(result.body.id, "alice");
    assert.equal(result.body.userId, "alice");
    assert.equal(result.body.email, "alice@example.test");
    assert.equal(result.body.isAdmin, false);
    assert.equal(result.body.admin, false);
    assert.equal(result.body.claims.admin, false);
    assert.equal(result.body.customClaims.admin, false);
    assert.equal(result.body.fromCollection, "users");
    assert.equal(result.body.test, false);
    await bearer(request(app).get("/admin")).expect(403);
  });
  it("does not promote a pre-existing role=admin profile", async () => {
    await seed("users", "alice", { ...financial, role: "admin", isAdmin: true });
    await bearer(request(app).get("/admin")).expect(403);
    const result = await bearer(request(app).get("/auth/verify")).expect(200);
    assert.equal(result.body.user.isAdmin, false);
    assert.equal((await db.collection("users").doc("alice").get()).data().role, "admin");
  });
  it("quarantines valid historical admin claims and raw stored-claim fallback for an unreviewed identity", async () => {
    tokens.set(ordinaryToken, {
      uid: "alice",
      email: "alice@example.test",
      admin: true,
      isAdmin: true,
      role: "admin",
    });
    accounts.get("alice").customClaims = { admin: true };
    await seed("admins", "alice", { role: "admin", isAdmin: true });
    await bearer(request(app).get("/admin")).expect(403);
    await bearer(request(app).get("/real-admin/overview")).expect(403);
    const result = await bearer(request(app).get("/auth/verify")).expect(200);
    assert.equal(result.body.user.isAdmin, false);
    assert.equal(result.body.user.role, "user");
    await request(app).post("/auth/admin-login").send({ idToken: ordinaryToken }).expect(403);
  });
  it("keeps claim and legacy collection admins authenticated", async () => {
    await bearer(request(app).get("/admin"), claimsToken).expect(200);
    await seed("admins", "member-admin", { name: "Legacy admin", uid: "victim", role: "user" });
    await bearer(request(app).get("/admin"), memberToken).expect(200);
    const result = await bearer(request(app).get("/auth/verify"), memberToken).expect(200);
    assert.equal(result.body.user.uid, "member-admin");
    assert.equal(result.body.user.isAdmin, true);
  });
  it("rejects revoked privileged sessions through both authentication entry points", async () => {
    revokedTokens.add(claimsToken);
    await bearer(request(app).get("/admin"), claimsToken).expect(401);
    await bearer(request(app).get("/auth/verify"), claimsToken).expect(401);
  });
  it("rejects absent and invalid tokens", async () => {
    await request(app).get("/admin").expect(401);
    await bearer(request(app).get("/admin"), "eyJ" + "z".repeat(150)).expect(401);
  });
  it("keeps claimed admin access while a database lookup fails and denies unprivileged claims", async () => {
    const original = db.collection;
    db.collection = () => {
      throw new Error("fixture database unavailable");
    };
    try {
      await bearer(request(app).get("/admin")).expect(403);
      await bearer(request(app).get("/admin"), claimsToken).expect(200);
    } finally {
      db.collection = original;
    }
  });
  it("does not return forged authority from ID-token login", async () => {
    await seed("users", "alice", { ...financial, role: "admin", isAdmin: true });
    const response = await request(app)
      .post("/auth/login")
      .send({ idToken: ordinaryToken })
      .expect(200);
    assert.equal(response.body.user.isAdmin, false);
    assert.equal(response.body.user.role, "user");
    assert.equal(tokenMints.length, 0);
  });
  it("never mints privileged custom claims from a forged profile after password verification", async () => {
    await seed("users", "alice", { ...financial, role: "admin", isAdmin: true });
    const fetch = globalThis.fetch,
      key = process.env.FIREBASE_API_KEY;
    process.env.FIREBASE_API_KEY = "fixture-public-api-key";
    globalThis.fetch = async url => {
      assert.match(
        url,
        /^https:\/\/identitytoolkit.googleapis.com\/v1\/accounts:signInWithPassword/
      );
      return { ok: true, json: async () => ({ idToken: ordinaryToken }) };
    };
    try {
      await request(app)
        .post("/auth/login")
        .send({ email: "alice@example.test", password: "fixture" })
        .expect(200);
      assert.deepEqual(tokenMints, [{ uid: "alice", claims: { role: "user", isAdmin: false } }]);
    } finally {
      globalThis.fetch = fetch;
      if (key === undefined) delete process.env.FIREBASE_API_KEY;
      else process.env.FIREBASE_API_KEY = key;
    }
  });
  it("rejects wrong passwords before issuing any token", async () => {
    const fetch = globalThis.fetch,
      key = process.env.FIREBASE_API_KEY;
    process.env.FIREBASE_API_KEY = "fixture-public-api-key";
    globalThis.fetch = async () => ({
      ok: false,
      json: async () => ({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }),
    });
    try {
      await request(app)
        .post("/auth/login")
        .send({ email: "alice@example.test", password: "wrong" })
        .expect(401);
      assert.equal(tokenMints.length, 0);
    } finally {
      globalThis.fetch = fetch;
      if (key === undefined) delete process.env.FIREBASE_API_KEY;
      else process.env.FIREBASE_API_KEY = key;
    }
  });
  it("disables test-token and E2E bypasses on hosted runtimes even without NODE_ENV=production", async () => {
    const old = process.env.K_SERVICE;
    process.env.K_SERVICE = "fixture-cloud-run";
    try {
      await request(app).get("/admin").set("x-playwright-e2e", "1").expect(401);
      await bearer(request(app).get("/admin"), "test-token-for-admin").expect(401);
    } finally {
      if (old === undefined) delete process.env.K_SERVICE;
      else process.env.K_SERVICE = old;
    }
  });
  it("rejects unverified existing-email registration without changing claims or stored finances", async () => {
    const before = (await db.collection("users").doc("alice").get()).data();
    await request(app)
      .post("/auth/register")
      .send({ email: "alice@example.test", password: "arbitrary", name: "Attacker" })
      .expect(409);
    assert.deepEqual((await db.collection("users").doc("alice").get()).data(), before);
    assert.deepEqual(claimWrites, []);
    assert.equal(accounts.get("alice").displayName, "Alice");
  });
  it("does not fall back from an invalid registration token to an email lookup", async () => {
    await request(app)
      .post("/auth/register")
      .send({ idToken: "invalid", email: "alice@example.test", password: "arbitrary" })
      .expect(401);
    assert.deepEqual(claimWrites, []);
  });
  it("preserves existing balances, tiers, tester access and claims on verified re-registration", async () => {
    await request(app)
      .post("/auth/register")
      .send({ idToken: ordinaryToken, name: "Updated name", email: "alice@example.test" })
      .expect(201);
    const saved = (await db.collection("users").doc("alice").get()).data();
    for (const [key, value] of Object.entries(financial)) assert.deepEqual(saved[key], value);
    assert.equal(saved.name, "Updated name");
    assert.deepEqual(claimWrites, []);
  });
  it("rejects an authenticated registration email switch", async () => {
    await request(app)
      .post("/auth/register")
      .send({ idToken: ordinaryToken, email: "other@example.test" })
      .expect(400);
    assert.equal(accounts.get("alice").email, "alice@example.test");
  });
  it("creates a regular account while ignoring supplied admin and financial fields", async () => {
    await request(app)
      .post("/auth/register")
      .send({
        email: "new@example.test",
        password: "fixture-password",
        name: "New",
        role: "admin",
        isAdmin: true,
        credits: 999,
        subscriptionTier: "enterprise",
      })
      .expect(201);
    const account = [...accounts.values()].find(a => a.email === "new@example.test");
    const stored = (await db.collection("users").doc(account.uid).get()).data();
    assert.equal(stored.role, "user");
    assert.equal(stored.isAdmin, false);
    assert.equal(stored.credits, undefined);
  });
  it("preserves profile API editing and ignores injected financial or authority fields", async () => {
    await bearer(request(app).put("/users/me"))
      .send({
        name: "Preference edit",
        timezone: "Africa/Johannesburg",
        notifications: { email: { weeklyDigest: true } },
        defaultPlatforms: ["youtube"],
        autoRepostEnabled: false,
        credits: 99999,
        role: "admin",
        subscriptionTier: "enterprise",
      })
      .expect(200);
    let saved = (await db.collection("users").doc("alice").get()).data();
    for (const [key, value] of Object.entries(financial)) assert.deepEqual(saved[key], value);
    assert.equal(saved.name, "Preference edit");
    assert.equal(saved.timezone, "Africa/Johannesburg");
    await bearer(request(app).put("/users/profile"))
      .send({
        name: "Profile edit",
        email: "alice@example.test",
        paypalEmail: "payout@example.test",
        role: "admin",
        credits: 999,
      })
      .expect(200);
    saved = (await db.collection("users").doc("alice").get()).data();
    for (const [key, value] of Object.entries(financial)) assert.deepEqual(saved[key], value);
    assert.equal(saved.paypalEmail, "payout@example.test");
  });
  it("does not allow plan self-assignment through the legacy pseudo-billing endpoint", async () => {
    const before = (await db.collection("users").doc("alice").get()).data();
    await bearer(request(app).post("/users/me/plan")).send({ tier: "enterprise" }).expect(410);
    assert.deepEqual((await db.collection("users").doc("alice").get()).data(), before);
  });
});
