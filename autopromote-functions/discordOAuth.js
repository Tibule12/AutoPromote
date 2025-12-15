const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const region = "us-central1";

exports.getDiscordAuthUrl = functions.region(region).https.onCall(async (data, context) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new functions.https.HttpsError("failed-precondition", "Discord client config missing.");
  }
  const scope = process.env.DISCORD_SCOPES || "identify guilds";
  const state = data && data.state ? data.state : require("crypto").randomBytes(8).toString("hex");
  const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
  return { url, state };
});

exports.discordOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
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
            { lastCallback: Date.now(), platform: "discord", placeholder: true },
            { merge: true }
          );
      } catch (_) {}
      return res
        .status(200)
        .send("Discord callback received; server missing client config for token exchange.");
    }
    const tokenUrl = "https://discord.com/api/oauth2/token";
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tokenJson = await tokenRes.json();
    // Persist tokens similarly to the routes
    let uid = null;
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
    const { encryptToken } = require("./secretVault");
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
        .doc("discord")
        .set(storeData, { merge: true });
    } else {
      await admin
        .firestore()
        .collection("discord_tokens")
        .add({ tokenJson: encryptToken(JSON.stringify(tokenJson)), createdAt: Date.now() });
    }
    // Notify and close or redirect
    return res.status(200).send("Discord OAuth callback received. You can close this window.");
  } catch (e) {
    console.error("Discord callback error", e);
    return res
      .status(500)
      .send("Discord callback error: " + (e && e.message ? e.message : "unknown"));
  }
});
