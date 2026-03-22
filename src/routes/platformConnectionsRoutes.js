const express = require("express");
const authMiddleware = require("../authMiddleware");
const { db } = require("../firebaseAdmin");
const router = express.Router();
const { rateLimiter } = require("../middlewares/globalRateLimiter");
const platformConnectionsPublicLimiter = rateLimiter({
  capacity: parseInt(process.env.RATE_LIMIT_PLATFORM_CONNECTIONS_PUBLIC || "120", 10),
  refillPerSec: parseFloat(process.env.RATE_LIMIT_REFILL || "10"),
  windowHint: "platform_connections_public",
});

const PLATFORM_NAMES = [
  "twitter",
  "youtube",
  "facebook",
  "instagram",
  "tiktok",
  "spotify",
  "reddit",
  "discord",
  "linkedin",
  "telegram",
  "pinterest",
  "snapchat",
];

const TIKTOK_REQUIRED_PUBLISH_SCOPES = ["video.upload", "video.publish"];

function parseScopeList(scopeValue) {
  if (Array.isArray(scopeValue)) {
    return scopeValue.map(scope => String(scope || "").trim()).filter(Boolean);
  }
  return String(scopeValue || "")
    .split(/[\s,]+/)
    .map(scope => scope.trim())
    .filter(Boolean);
}

function getTikTokScopeValue(connection) {
  if (!connection || typeof connection !== "object") return "";
  if (typeof connection.scope === "string" && connection.scope.trim()) return connection.scope;
  if (Array.isArray(connection.scope)) return connection.scope.join(" ");
  if (typeof connection.scopes === "string" && connection.scopes.trim()) return connection.scopes;
  if (Array.isArray(connection.scopes)) return connection.scopes.join(" ");
  return "";
}

function getTikTokOpenId(connection) {
  return (
    connection?.open_id ||
    connection?.openId ||
    connection?.meta?.open_id ||
    connection?.meta?.openId ||
    null
  );
}

function hasTikTokAccessToken(connection) {
  if (!connection || typeof connection !== "object") return false;
  if (connection.hasAccessToken === true) return true;
  if (connection.hasEncryption === true) return true;
  if (typeof connection.access_token === "string" && connection.access_token.trim()) return true;
  if (
    typeof connection.encrypted_access_token === "string" &&
    connection.encrypted_access_token.trim()
  )
    return true;
  if (
    typeof connection.encrypted_user_access_token === "string" &&
    connection.encrypted_user_access_token.trim()
  ) {
    return true;
  }
  if (connection.tokens && typeof connection.tokens === "object") {
    return !!(
      typeof connection.tokens.access_token === "string" && connection.tokens.access_token.trim()
    );
  }
  if (typeof connection.tokens === "string" && connection.tokens.trim()) return true;
  return false;
}

function buildTikTokReadiness(connection) {
  const scopeValue = getTikTokScopeValue(connection);
  const grantedScopes = parseScopeList(scopeValue);
  const hasOpenId = !!getTikTokOpenId(connection);
  const hasAccessToken = hasTikTokAccessToken(connection);
  const missingScopes = TIKTOK_REQUIRED_PUBLISH_SCOPES.filter(
    scope => !grantedScopes.includes(scope)
  );
  return {
    hasAccessToken,
    hasOpenId,
    grantedScopes,
    missingScopes,
    publishReady: hasAccessToken && hasOpenId && missingScopes.length === 0,
    reauthRecommended: !(hasAccessToken && hasOpenId && missingScopes.length === 0),
  };
}

function sanitizeConnection(data) {
  if (!data || typeof data !== "object") return {};
  const safe = Object.assign({}, data);
  delete safe.tokens;
  delete safe.access_token;
  delete safe.refresh_token;
  delete safe.client_secret;
  delete safe.secret;
  return safe;
}

function getUserDocFallback(userData, name) {
  if (!userData || typeof userData !== "object") return { connected: false };
  const lowerKeys = Object.keys(userData).map(key => key.toLowerCase());
  const hasToken = lowerKeys.some(key => key.includes(name) && key.includes("token"));
  const identity =
    userData[`${name}Identity`] ||
    userData[`${name}_identity`] ||
    userData[`${name}Profile`] ||
    null;
  if (hasToken || identity) {
    return { connected: true, inferred: true, identity, source: "userDoc" };
  }
  return { connected: false };
}

function normalizeConnectionMap(connectionDocs, userData) {
  const connections = {};

  PLATFORM_NAMES.forEach(name => {
    if (name === "instagram") return;
    const docData = connectionDocs[name];
    connections[name] = docData
      ? { connected: true, ...sanitizeConnection(docData), source: "subcollection" }
      : getUserDocFallback(userData, name);
  });

  const facebook = connections.facebook || { connected: false };
  const linkedInstagramId =
    facebook.ig_business_account_id ||
    facebook.instagramBusinessAccountId ||
    facebook.instagramId ||
    facebook.meta?.instagram_business_account_id ||
    null;
  const linkedInstagramPage = Array.isArray(facebook.pages)
    ? facebook.pages.find(page => page && page.ig_business_account_id)
    : null;

  connections.instagram =
    linkedInstagramId || linkedInstagramPage
      ? {
          connected: true,
          source: "facebook_link",
          ig_business_account_id:
            linkedInstagramId || linkedInstagramPage?.ig_business_account_id || null,
          display_name:
            facebook.display_name ||
            facebook.meta?.display_name ||
            linkedInstagramPage?.name ||
            null,
          pages: Array.isArray(facebook.pages)
            ? facebook.pages
                .filter(
                  page => page && (page.ig_business_account_id || page.instagram_business_account)
                )
                .map(page => ({
                  id: page.id,
                  name: page.name,
                  ig_business_account_id:
                    page.ig_business_account_id || page.instagram_business_account?.id || null,
                }))
            : [],
        }
      : { connected: false };

  return connections;
}

router.get(
  "/status",
  authMiddleware,
  platformConnectionsPublicLimiter,
  require("../statusInstrument")("platformConnectionsStatus", async (req, res) => {
    const { getCache, setCache } = require("../utils/simpleCache");
    const uid = req.userId || req.user?.uid;
    const cacheKey = `platform_connections_status_${uid}`;
    const cached = getCache(cacheKey);
    if (cached) return res.json({ ...cached, _cached: true });
    const userRef = db.collection("users").doc(uid);
    const [connectionsSnap, userSnap] = await Promise.all([
      userRef.collection("connections").get(),
      userRef.get(),
    ]);

    const connectionDocs = {};
    connectionsSnap.forEach(doc => {
      connectionDocs[doc.id] = doc.data() || {};
    });
    const userData = userSnap.exists ? userSnap.data() || {} : {};
    const connections = normalizeConnectionMap(connectionDocs, userData);

    const twitter = connections.twitter || { connected: false };
    const youtube = connections.youtube || { connected: false };
    const facebook = connections.facebook || { connected: false };
    const instagram = connections.instagram || { connected: false };
    const tiktok = connections.tiktok || { connected: false };
    const spotify = connections.spotify || { connected: false };
    const reddit = connections.reddit || { connected: false };
    const discord = connections.discord || { connected: false };
    const linkedin = connections.linkedin || { connected: false };
    const telegram = connections.telegram || { connected: false };
    const pinterest = connections.pinterest || { connected: false };
    const snapchat = connections.snapchat || { connected: false };
    const tiktokReadiness = tiktok.connected
      ? buildTikTokReadiness(connectionDocs.tiktok || tiktok)
      : {
          hasAccessToken: false,
          hasOpenId: false,
          grantedScopes: [],
          missingScopes: [],
          publishReady: false,
          reauthRecommended: false,
        };

    const summary = {
      twitter: {
        connected: twitter.connected,
        username: twitter.identity?.username,
        display_name: twitter.display_name || twitter.meta?.display_name || twitter.identity?.name,
      },
      youtube: {
        connected: youtube.connected,
        channelTitle: youtube.channel?.snippet?.title,
        display_name: youtube.meta?.display_name || youtube.channel?.snippet?.title,
      },
      facebook: {
        connected: facebook.connected,
        pages: Array.isArray(facebook.pages) ? facebook.pages.map(p => p.name).slice(0, 3) : [],
        display_name:
          facebook.display_name ||
          facebook.meta?.display_name ||
          (Array.isArray(facebook.pages) && facebook.pages[0]?.name) ||
          null,
      },
      instagram: {
        connected: instagram.connected,
        display_name:
          instagram.display_name ||
          (Array.isArray(instagram.pages) && instagram.pages[0]?.name) ||
          null,
        ig_business_account_id: instagram.ig_business_account_id || null,
        pages: Array.isArray(instagram.pages) ? instagram.pages.map(p => p.name).slice(0, 3) : [],
      },
      tiktok: {
        connected: tiktok.connected,
        display_name: tiktok.display_name || tiktok.meta?.display_name,
        publishReady: tiktokReadiness.publishReady,
      },
      spotify: {
        connected: spotify.connected,
        display_name: spotify.meta?.display_name,
        playlistsCount: Array.isArray(spotify.meta?.playlists)
          ? spotify.meta.playlists.length
          : undefined,
      },
      reddit: {
        connected: reddit.connected,
        name: reddit.meta?.username,
        display_name: reddit.meta?.display_name || reddit.meta?.username,
      },
      discord: {
        connected: discord.connected,
        servers: Array.isArray(discord.meta?.guilds)
          ? discord.meta.guilds.map(g => g.name).slice(0, 3)
          : [],
        display_name:
          discord.meta?.display_name ||
          (Array.isArray(discord.meta?.guilds) && discord.meta.guilds[0]?.name),
      },
      linkedin: {
        connected: linkedin.connected,
        organizations: Array.isArray(linkedin.meta?.organizations)
          ? linkedin.meta.organizations.map(o => o.name).slice(0, 3)
          : [],
        display_name: linkedin.meta?.display_name || null,
      },
      telegram: {
        connected: telegram.connected,
        chatId: telegram.meta?.chatId,
        display_name: telegram.meta?.display_name || telegram.identity?.name || null,
      },
      pinterest: {
        connected: pinterest.connected,
        boards: pinterest.meta?.boards?.length,
        display_name: pinterest.meta?.display_name || null,
      },
      snapchat: {
        connected: snapchat.connected,
        display_name:
          snapchat.display_name ||
          snapchat.meta?.display_name ||
          snapchat.identity?.name ||
          snapchat.profile?.displayName ||
          null,
      },
    };
    const payload = {
      ok: true,
      summary,
      raw: {
        twitter: sanitizeConnection(twitter),
        youtube: sanitizeConnection(youtube),
        facebook: sanitizeConnection(facebook),
        instagram: sanitizeConnection(instagram),
        tiktok: { ...sanitizeConnection(tiktok), ...tiktokReadiness },
        spotify: sanitizeConnection(spotify),
        reddit: sanitizeConnection(reddit),
        discord: sanitizeConnection(discord),
        linkedin: sanitizeConnection(linkedin),
        telegram: sanitizeConnection(telegram),
        pinterest: sanitizeConnection(pinterest),
        snapchat: sanitizeConnection(snapchat),
      },
    };
    setCache(cacheKey, payload, 7000);
    res.json(payload);
  })
);

// Disconnect a platform (remove connection doc) - POST /api/platform/disconnect/:platform
router.post(
  "/disconnect/:platform",
  authMiddleware,
  platformConnectionsPublicLimiter,
  async (req, res) => {
    try {
      const uid = req.userId || req.user?.uid;
      const { platform } = req.params || {};
      const allowed = [
        "twitter",
        "youtube",
        "facebook",
        "tiktok",
        "spotify",
        "reddit",
        "discord",
        "linkedin",
        "telegram",
        "pinterest",
        "snapchat",
      ];
      if (!platform || !allowed.includes(platform))
        return res.status(400).json({ error: "invalid_platform" });
      const userRef = db.collection("users").doc(uid);
      const connRef = userRef.collection("connections").doc(platform);
      await connRef.delete();
      return res.json({ disconnected: true, platform });
    } catch (e) {
      console.error("[platformConnectionsRoutes] disconnect error", e);
      return res.status(500).json({ error: "Failed to disconnect" });
    }
  }
);

module.exports = router;
