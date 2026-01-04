const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const region = "us-central1";

exports.getSnapchatAuthUrl = functions.region(region).https.onCall(async (data, context) => {
  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  const redirectUri = process.env.SNAPCHAT_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new functions.https.HttpsError("failed-precondition", "Snapchat client config missing.");
  }
  const state = data && data.state ? data.state : require("crypto").randomBytes(8).toString("hex");
  const url = `https://accounts.snapchat.com/accounts/oauth2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(process.env.SNAPCHAT_SCOPES || "snapchat-marketing-api")} &state=${encodeURIComponent(state)}`;
  return { url, state };
});

exports.snapchatOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
  const clientId = process.env.SNAPCHAT_CLIENT_ID;
  const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;
  const redirectUri = process.env.SNAPCHAT_REDIRECT_URI;
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
            { lastCallback: Date.now(), platform: "snapchat", placeholder: true },
            { merge: true }
          );
      } catch (_) {}
      return res
        .status(200)
        .send("Snapchat callback received; server missing client config for token exchange.");
    }
    // Placeholder: do not attempt exchange by default
    const tokenJson = { placeholder: true, code };
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
        .doc("snapchat")
        .set(storeData, { merge: true });
    } else {
      await admin
        .firestore()
        .collection("snapchat_tokens")
        .add({ tokenJson: encryptToken(JSON.stringify(tokenJson)), createdAt: Date.now() });
    }
    return res.status(200).send("Snapchat OAuth callback received. You can close this window.");
  } catch (e) {
    console.error("Snapchat callback error", e);
    return res
      .status(500)
      .send("Snapchat callback error: " + (e && e.message ? e.message : "unknown"));
  }
});
