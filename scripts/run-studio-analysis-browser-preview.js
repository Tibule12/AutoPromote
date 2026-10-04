#!/usr/bin/env node
// Local acceptance host, using the real authenticated API and staging Firebase.
// Requires local ADC and a private bootstrap file generated for this run.
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const projectId = "autopromote-staging-2026";
const root = path.resolve(__dirname, "..");
const port = Number(process.env.STUDIO_BROWSER_PORT || 5006);
const bootstrapPath = process.env.STUDIO_BROWSER_BOOTSTRAP;
assert(bootstrapPath, "Set STUDIO_BROWSER_BOOTSTRAP to the private local JSON");
const boot = JSON.parse(fs.readFileSync(bootstrapPath, "utf8"));
assert.equal(boot.projectId, projectId);
assert.equal(boot.firebase.projectId, projectId);
assert.equal(boot.firebase.storageBucket, `${projectId}.firebasestorage.app`);
assert.equal(boot.ownerUid, "staging-smoke");
assert(boot.storagePath.startsWith(`studio/sources/${boot.ownerUid}/`));
for (const key of [
  "FIREBASE_ADMIN_BYPASS",
  "CI_ROUTE_IMPORTS",
  "JEST_WORKER_ID",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "STORAGE_EMULATOR_HOST",
])
  assert(!process.env[key], `${key} must be unset for real staging acceptance`);
process.env.NODE_ENV = "production";
process.env.GOOGLE_CLOUD_PROJECT = projectId;
process.env.FIREBASE_PROJECT_ID = projectId;
process.env.FIREBASE_STORAGE_BUCKET = boot.firebase.storageBucket;
process.env.FIREBASE_DATABASE_URL = `https://${projectId}.firebaseio.com`;
assert(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON && !process.env.FIREBASE_PRIVATE_KEY);
const admin = require("firebase-admin");
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId,
  storageBucket: boot.firebase.storageBucket,
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});
// User ADC reads staging objects but has no client_email for URL signing. The
// storage SDK signs through real IAM using the same staging signer as preparation.
// No private key, signed-response fixture or authorization bypass is used.
const stagingStorageAuth = admin.storage().bucket().storage.authClient;
stagingStorageAuth.getCredentials = async () => ({
  client_email: `studio-analysis-smoke@${projectId}.iam.gserviceaccount.com`,
});
const express = require("express");
const authMiddleware = require("../src/authMiddleware");
const { getPlanCapabilities } = require("../src/config/subscriptionPlans");
const { getEffectiveTierSnapshot } = require("../src/services/billingService");
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.get("/api/health", (_req, res) => res.json({ projectId, status: "OK" }));
app.get("/api/users/profile", authMiddleware, async (req, res) => {
  try {
    const tier = await getEffectiveTierSnapshot(req.user.uid);
    res.json({ success: true, planId: tier.tierId, ...getPlanCapabilities(tier.tierId) });
  } catch (_) {
    res.status(503).json({ error: "STAGING_PROFILE_UNAVAILABLE" });
  }
});
// Analysis and owned saved-source resolution use the production media router.
app.use(
  "/api/media",
  (req, res, next) => {
    if (!/^\/(?:studio-analysis-jobs(?:\/|$)|studio-assets\/resolve$)/.test(req.path))
      return res.sendStatus(404);
    next();
  },
  require("../src/mediaRoutes")
);
app.use("/api/studio/analysis-artifacts", require("../src/routes/studioAnalysisArtifactRoutes"));
app.use("/api", (_req, res) => res.status(404).json({ error: "OUTSIDE_ACCEPTANCE_SCOPE" }));

// Build the production component through CRA's existing loaders. Changing the
// entry never changes frontend/src/index.js or the deployed frontend bundle.
process.env.NODE_ENV = "development";
process.env.BABEL_ENV = "development";
process.env.FAST_REFRESH = "false";
process.env.REACT_APP_ENABLE_STUDIO_ANALYSIS_JOBS = "true";
process.env.REACT_APP_E2E_AUTH_BYPASS = "false";
process.env.REACT_APP_API_URL = `http://127.0.0.1:${port}`;
const configNames = {
  apiKey: "API_KEY",
  authDomain: "AUTH_DOMAIN",
  projectId: "PROJECT_ID",
  storageBucket: "STORAGE_BUCKET",
  messagingSenderId: "MESSAGING_SENDER_ID",
  appId: "APP_ID",
};
for (const [name, suffix] of Object.entries(configNames))
  process.env[`REACT_APP_FIREBASE_${suffix}`] = boot.firebase[name];
process.chdir(path.join(root, "frontend"));
const frontendRequire = require("module").createRequire(path.join(root, "frontend/package.json"));
const webpack = frontendRequire("webpack");
const config = frontendRequire("react-scripts/config/webpack.config")("development");
config.entry = path.join(root, "test/e2e/playwright/studio-analysis-staging-entry.jsx");
config.output.path = path.join(root, "artifacts/studio-analysis-browser-20261004/build");
config.output.publicPath = "/";
config.resolve.plugins = config.resolve.plugins.filter(
  plugin => plugin.constructor.name !== "ModuleScopePlugin"
);
config.resolve.modules.unshift(path.join(root, "frontend/node_modules"));
// Include this explicit acceptance entry in the same Babel rule as app source.
const oneOf = config.module.rules.find(rule => rule.oneOf).oneOf;
const babelRule = oneOf.find(rule => rule.loader?.includes("babel-loader") && rule.include);
babelRule.include = [path.join(root, "frontend/src"), path.dirname(config.entry)];
config.plugins = config.plugins.filter(
  plugin =>
    ![
      "HtmlWebpackPlugin",
      "InterpolateHtmlPlugin",
      "ForkTsCheckerWebpackPlugin",
      "ESLintWebpackPlugin",
      "ReactRefreshPlugin",
    ].includes(plugin.constructor.name)
);
config.cache = false;
config.devtool = false;
// API auth bypass decisions read NODE_ENV at request time.
process.env.NODE_ENV = "production";
webpack(config, (error, stats) => {
  if (error || stats.hasErrors()) {
    console.error(error?.message || stats.toString({ all: false, errors: true }));
    process.exitCode = 1;
    return;
  }
  const publicBoot = { ...boot };
  delete publicBoot.customToken;
  delete publicBoot.otherCustomToken;
  const safeBoot = JSON.stringify(publicBoot).replace(/</g, "\\u003c");
  app.get("/", (_req, res) =>
    res
      .type("html")
      .send(
        `<!doctype html><html><head><meta charset="utf-8"><title>Studio staging acceptance</title></head>` +
          `<body><div id="root"></div><script>window.__STUDIO_STAGING_BOOTSTRAP=${safeBoot}</script>` +
          `<script defer src="/static/js/bundle.js"></script></body></html>`
      )
  );
  app.use(express.static(config.output.path));
  app.listen(port, "127.0.0.1", () =>
    console.log(
      JSON.stringify({
        ready: true,
        url: `http://127.0.0.1:${port}`,
        projectId,
        realFirebaseAuth: true,
        authBypass: false,
        productionEditor: true,
        frontendJobFlag: true,
        mountedApiRouter: "src/mediaRoutes.js",
      })
    )
  );
});
