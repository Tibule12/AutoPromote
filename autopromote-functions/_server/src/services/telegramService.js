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
function verifyTelegramAuth(data, botToken = process.env.TELEGRAM_BOT_TOKEN) {
  if (!data || !botToken || !/^[a-f0-9]{64}$/.test(data.hash || "")) return false;
  const { hash: checkHash, ...authData } = data;

  const dataCheckArr = Object.keys(authData)
    .filter(key => authData[key])
    .sort()
    .map(key => `${key}=${authData[key]}`);

  const dataCheckString = dataCheckArr.join("\n");
  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(checkHash, "hex"));
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

  if (!Number.isFinite(authDate) || authDate > now + 60 || now - authDate > 86400) {
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

async function postToTelegram(args) {
  return require("./communityDelivery").deliver({ ...args, platform: "telegram" });
}

/**
 * Send a generic notification/alert to a Telegram user (for growth alerts, etc.)
 * Maps to user requirement: send_creator_alert
 */
async function sendTelegramAlert(chatId, text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !chatId) return { success: false, error: "missing_config" };

  try {
    const res = await fetchFn(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
    return { success: res.ok };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  postToTelegram,
  verifyTelegramAuth,
  storeTelegramAuth,
  getUserTelegramConnection,
  sendTelegramAlert,
};
