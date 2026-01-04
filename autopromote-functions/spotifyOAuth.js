const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const region = "us-central1";

exports.getSpotifyAuthUrl = functions.region(region).https.onCall(async (data, context) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new functions.https.HttpsError("failed-precondition", "Spotify client config missing.");
  }
  const scope =
    process.env.SPOTIFY_SCOPES || "user-read-email playlist-modify-public playlist-modify-private";
  const state = data && data.state ? data.state : require("crypto").randomBytes(8).toString("hex");
  const url = `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
  return { url, state };
});

exports.spotifyOAuthCallback = functions.region(region).https.onRequest(async (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
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
            { lastCallback: Date.now(), platform: "spotify", placeholder: true },
            { merge: true }
          );
      } catch (_) {}
      return res
        .status(200)
        .send("Spotify callback received; server missing client config for token exchange.");
    }
    const tokenUrl = "https://accounts.spotify.com/api/token";
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const tokenJson = await tokenRes.json();
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
        .doc("spotify")
        .set(storeData, { merge: true });
    } else {
      await admin
        .firestore()
        .collection("spotify_tokens")
        .add({ tokenJson: encryptToken(JSON.stringify(tokenJson)), createdAt: Date.now() });
    }
    return res.status(200).send("Spotify OAuth callback received. You can close this window.");
  } catch (e) {
    console.error("Spotify callback error", e);
    return res
      .status(500)
      .send("Spotify callback error: " + (e && e.message ? e.message : "unknown"));
  }
});
