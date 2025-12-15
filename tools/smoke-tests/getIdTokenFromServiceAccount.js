#!/usr/bin/env node
// Create a Firebase custom token using service-account-key.json and exchange
// it for an ID token using Firebase Identity Toolkit REST API.

const path = require("path");
const fs = require("fs");

async function main() {
  const admin = require("firebase-admin");

  const svcPath = path.resolve(process.cwd(), "service-account-key.json");
  if (!fs.existsSync(svcPath)) {
    console.error("service-account-key.json not found in repo root.");
    process.exit(2);
  }

  // Accept API key from env (preferred) or fall back to the provided production client key.
  const apiKey =
    process.env.REACT_APP_FIREBASE_API_KEY ||
    process.env.FIREBASE_API_KEY ||
    process.env.FIREBASE_API_KEY_OVERRIDE ||
    "AIzaSyBA9It1gCyKBpqAhGM5TxwdNoe68c3qEBE";

  admin.initializeApp({ credential: admin.credential.cert(require(svcPath)) });

  const uid = "smoke-test-" + Date.now();
  const additionalClaims = { admin: true, role: "admin" };

  try {
    const customToken = await admin.auth().createCustomToken(uid, additionalClaims);
    console.log("Custom token created, length=", customToken.length);

    // Exchange custom token for ID token
    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
    const body = { token: customToken, returnSecureToken: true };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Failed to exchange custom token:", res.status, data);
      process.exit(3);
    }
    // data.idToken is the Firebase ID token
    console.log("\nID_TOKEN=" + data.idToken);
    // Print a short preview
    console.log("ID token expires in (sec):", data.expiresIn || "n/a");
    // exit with token on stdout
    // optionally write to a file
    fs.writeFileSync(
      path.resolve(process.cwd(), "tools", "smoke-tests", ".idtoken"),
      data.idToken,
      { encoding: "utf8" }
    );
    process.exit(0);
  } catch (e) {
    console.error("Error creating/exchanging token:", e.message || e);
    process.exit(4);
  }
}

main();
