// telegramService.js - Telegram Bot API and Login Widget integration
const { db } = require("../firebaseAdmin");
const crypto = require("crypto");

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (_) {
    fetchFn = null;
  }
}

/**
 * Verify Telegram Login Widget data
 * https://core.telegram.org/widgets/login#checking-authorization
 */
function verifyTelegramAuth(authData, botToken) {
  const checkHash = authData.hash;
  delete authData.hash;

  const dataCheckArr = Object.keys(authData)
    .filter(key => authData[key])
    .sort()
    .map(key => `${key}=${authData[key]}`);

  const dataCheckString = dataCheckArr.join("\n");
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return hash === checkHash;
}

/**
 * Get user's Telegram connection
 */

async function getUserTelegramConnection(uid) {
  const snap = await db
    .collection("users")
    .doc(uid)
    .collection("connections")
    .doc("telegram")
    .get();
  if (!snap.exists) return null;
  return snap.data();
}

/**
 * Store Telegram Login Widget auth data
 */
async function storeTelegramAuth({ uid, authData }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN not configured");
  }

  // Verify auth data
  if (!verifyTelegramAuth(authData, botToken)) {
    throw new Error("Invalid Telegram auth data");
  }

  // Check auth timestamp (should be recent)
  const authDate = parseInt(authData.auth_date);
  const now = Math.floor(Date.now() / 1000);

  if (now - authDate > 86400) {
    // 24 hours
    throw new Error("Telegram auth data expired");
  }

  const connectionRef = db.collection("users").doc(uid).collection("connections").doc("telegram");

  await connectionRef.set(
    {
      connected: true,
      profile: {
        id: authData.id,
        first_name: authData.first_name,
        last_name: authData.last_name || null,
        username: authData.username || null,
        photo_url: authData.photo_url || null,
      },
      meta: {
        chatId: authData.id, // User's chat ID is their Telegram user ID
        auth_date: authData.auth_date,
      },
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return {
    success: true,
    userId: authData.id,
    username: authData.username,
    chatId: authData.id,
  };
}

async function postToTelegram({ contentId, payload = {}, reason: _reason, uid }) {
  try {
    const userRef = uid ? db.collection("users").doc(uid) : null;
    let chatId = null;
    try {
      if (userRef) {
        const snap = await userRef.collection("connections").doc("telegram").get();
        if (snap.exists) {
          const d = snap.data() || {};
          chatId = d.meta?.chatId || d.chatId || (d.profile && d.profile.id) || null;
        }
      }
    } catch (_) {}

    // allow explicit chatId in payload as override
    if (!chatId && payload.chatId) chatId = payload.chatId;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || !chatId)
      return { platform: "telegram", simulated: true, reason: "missing_credentials_or_chatId" };

    const text = payload.text || payload.message || `AutoPromote post: ${contentId || ""}`;
    const videoUrl = payload.videoUrl || (payload.type === "video" ? payload.url : null);
    const imageUrl = payload.imageUrl || (payload.type === "image" ? payload.url : null);

    if (!fetchFn) return { platform: "telegram", simulated: true, reason: "missing_fetch" };

    let method = "sendMessage";
    let body = { chat_id: chatId };

    if (videoUrl) {
      method = "sendVideo";
      body.video = videoUrl;
      if (text) body.caption = text;
    } else if (imageUrl) {
      method = "sendPhoto";
      body.photo = imageUrl;
      if (text) body.caption = text;
    } else {
      body.text = text;
    }

    const res = await fetchFn(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch (_) {}
    const msgId = json && json.result && json.result.message_id ? json.result.message_id : null;

    // Store result in Firestore
    if (contentId && msgId) {
      try {
        await db
          .collection("content")
          .doc(contentId)
          .set(
            {
              telegram: {
                messageId: msgId,
                chatId,
                postedAt: new Date().toISOString(),
              },
            },
            { merge: true }
          );
      } catch (_) {}
    }

    return { platform: "telegram", success: true, messageId: msgId, chatId, raw: json };
  } catch (e) {
    return { platform: "telegram", success: false, error: e.message };
  }
}

module.exports = {
  postToTelegram,
  verifyTelegramAuth,
  storeTelegramAuth,
  getUserTelegramConnection,
};
