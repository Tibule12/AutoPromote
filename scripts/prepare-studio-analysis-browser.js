#!/usr/bin/env node
// Prepare short-lived localhost acceptance credentials using existing Google ADC.
// The output contains tokens and must stay in the ignored artifacts directory.
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { GoogleAuth } = require("google-auth-library");
const admin = require("firebase-admin");
const projectId = "autopromote-staging-2026";
const folder = path.resolve(__dirname, "../artifacts/studio-analysis-browser-20261004");
const signer = `studio-analysis-smoke@${projectId}.iam.gserviceaccount.com`;
const firebase = JSON.parse(fs.readFileSync(path.join(folder, "firebase-config.json"), "utf8"));
assert.equal(firebase.projectId, projectId);
assert.equal(firebase.storageBucket, `${projectId}.firebasestorage.app`);
assert(process.env.GOOGLE_APPLICATION_CREDENTIALS, "Supply existing Google ADC");
for (const key of [
  "FIREBASE_ADMIN_BYPASS",
  "CI_ROUTE_IMPORTS",
  "JEST_WORKER_ID",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIRESTORE_EMULATOR_HOST",
  "STORAGE_EMULATOR_HOST",
])
  assert(!process.env[key], `${key} must be unset`);
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId,
  serviceAccountId: signer,
  storageBucket: firebase.storageBucket,
});

async function main() {
  for (const uid of ["staging-smoke", "staging-browser-other"]) {
    try {
      await admin
        .auth()
        .createUser({
          uid,
          email: `${uid}@staging.invalid`,
          emailVerified: true,
          displayName: "Staging browser acceptance",
        });
    } catch (error) {
      if (error.code !== "auth/uid-already-exists") throw error;
    }
  }
  await admin
    .firestore()
    .collection("users")
    .doc("staging-smoke")
    .set(
      {
        email: "staging-smoke@staging.invalid",
        name: "Staging browser acceptance",
        role: "user",
        subscriptionTier: "pro",
        subscriptionStatus: "active",
        subscriptionPeriodEnd: new Date(Date.now() + 2 * 86400000).toISOString(),
      },
      { merge: true }
    );
  const client = await new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  }).getClient();
  const storagePath = "studio/sources/staging-smoke/ten-minute-20261004-4a6efc07.mp4";
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const canonical = `GET\n\n\n${expiry}\n/${firebase.storageBucket}/${storagePath}`;
  const signature = (
    await client.request({
      url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${signer}:signBlob`,
      method: "POST",
      data: { payload: Buffer.from(canonical).toString("base64") },
    })
  ).data.signedBlob;
  const sourceUrl =
    `https://storage.googleapis.com/${firebase.storageBucket}/${storagePath}?` +
    new URLSearchParams({ GoogleAccessId: signer, Expires: String(expiry), Signature: signature });
  const customToken = await admin.auth().createCustomToken("staging-smoke");
  const otherCustomToken = await admin.auth().createCustomToken("staging-browser-other");
  fs.writeFileSync(
    path.join(folder, "bootstrap.json"),
    JSON.stringify({
      projectId,
      ownerUid: "staging-smoke",
      storagePath,
      sourceUrl,
      firebase,
      customToken,
      otherCustomToken,
    }),
    { mode: 0o600 }
  );
  const bucketUrl = `https://storage.googleapis.com/storage/v1/b/${firebase.storageBucket}`;
  const bucket = (await client.request({ url: bucketUrl })).data;
  const cors = bucket.cors || [];
  const origin = `http://127.0.0.1:${Number(process.env.STUDIO_BROWSER_PORT || 5006)}`;
  if (!cors.some(rule => rule.origin?.includes(origin))) {
    const nextCors = [
      ...cors,
      {
        origin: [origin],
        method: ["GET", "HEAD"],
        responseHeader: ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"],
        maxAgeSeconds: 3600,
      },
    ];
    await client.request({ url: bucketUrl, method: "PATCH", data: { cors: nextCors } });
    fs.writeFileSync(
      path.join(folder, "cors-change.json"),
      JSON.stringify(
        {
          bucket: firebase.storageBucket,
          before: cors,
          after: nextCors,
        },
        null,
        2
      )
    );
  }
  console.log(
    JSON.stringify({
      prepared: true,
      projectId,
      ownerUid: "staging-smoke",
      credentials: "existing Google ADC; no new service-account key",
      tokenLifetimeSeconds: 3600,
    })
  );
  await admin.firestore().terminate();
}
main().catch(error => {
  // Google HTTP errors can contain authorization headers; never dump the object.
  console.error("Staging browser preparation failed:", error.code || error.message);
  process.exitCode = 1;
});
