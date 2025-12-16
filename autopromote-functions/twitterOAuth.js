const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const region = "us-central1";

exports.getTwitterAuthUrl = functions.region(region).https.onCall(async (data, context) => {
  // Twitter has multiple OAuth flows; return a placeholder or build a URL if env vars exist
  const clientId = process.env.TWITTER_CLIENT_ID || process.env.TWITTER_API_KEY;
  const redirectUri = process.env.TWITTER_REDIRECT_URI;
  const state = data && data.state ? data.state : require("crypto").randomBytes(8).toString("hex");
  if (!clientId || !redirectUri) {
    throw new functions.https.HttpsError("failed-precondition", "Twitter client config missing.");
  }
  const url = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(process.env.TWITTER_SCOPES || "tweet.read users.read")}&state=${encodeURIComponent(state)}`;
  return { url, state };
});

exports.twitterOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
  const clientId = process.env.TWITTER_CLIENT_ID || process.env.TWITTER_API_KEY;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_API_SECRET_KEY;
  const redirectUri = process.env.TWITTER_REDIRECT_URI;
  const { code, state } = req.query;
  if (!code) return res.status(400).send("Missing code");
  try {
    if (!(clientId && clientSecret && redirectUri)) {
      try {
        await admin
          .firestore()
          .collection("oauth_states")
          .doc(state || "anon")
          .set(
            { lastCallback: Date.now(), platform: "twitter", placeholder: true },
            { merge: true }
          );
      } catch (_) {}
      return res
        .status(200)
        .send("Twitter callback received; server missing client config for token exchange.");
    }
    // Token exchange endpoint varies by version; implement placeholder for now
    const tokenJson = { placeholder: true, code }; // TODO: implement real exchange
    let uid = null;
    const { encryptToken } = require("./secretVault");
    if (state) {
      try {
        const sd = await admin.firestore().collection("oauth_states").doc(state).get();
        if (sd.exists) {
          const s = sd.data();
          if (!s.expiresAt || new Date(s.expiresAt) > new Date()) uid = s.uid || null;
          try {
            await admin.firestore().collection("oauth_states").doc(state).delete();
          } catch (_) {}
        }
      } catch (_) {}
    }
    const storeData = {
      connected: true,
      tokens: encryptToken(JSON.stringify(tokenJson)),
      updatedAt: new Date().toISOString(),
    };
    if (uid && uid !== "anon") {
      await admin
        .firestore()
        .collection("users")
        .doc(uid)
        .collection("connections")
        .doc("twitter")
        .set(storeData, { merge: true });
    } else {
      await admin
        .firestore()
        .collection("twitter_tokens")
        .add({ tokenJson: encryptToken(JSON.stringify(tokenJson)), createdAt: Date.now() });
    }
    return res.status(200).send("Twitter OAuth callback received. You can close this window.");
  } catch (e) {
    console.error("Twitter callback error", e);
    return res
      .status(500)
      .send("Twitter callback error: " + (e && e.message ? e.message : "unknown"));
  }
});
