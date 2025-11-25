// telegramService.js - sends messages via Telegram Bot API when possible
const { db } = require('../firebaseAdmin');

let fetchFn = global.fetch;
if (!fetchFn) {
  try { fetchFn = require('node-fetch'); } catch(_) { fetchFn = null; }
}

async function postToTelegram({ contentId, payload = {}, reason, uid }) {
  try {
    const userRef = uid ? db.collection('users').doc(uid) : null;
    let chatId = null;
    try {
      if (userRef) {
        const snap = await userRef.collection('connections').doc('telegram').get();
        if (snap.exists) {
          const d = snap.data() || {};
          chatId = d.chatId || (d.meta && d.meta.chatId) || null;
        }
      }
    } catch (_){ }

    // allow explicit chatId in payload as override
    if (!chatId && payload.chatId) chatId = payload.chatId;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken || !chatId) return { platform: 'telegram', simulated: true, reason: 'missing_credentials_or_chatId' };

    const text = payload.text || payload.message || `AutoPromote post: ${contentId || ''}`;
    if (!fetchFn) return { platform: 'telegram', simulated: true, reason: 'missing_fetch' };

    const res = await fetchFn(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
    let json = null;
    try { json = await res.json(); } catch(_) { }
    const msgId = json && json.result && json.result.message_id ? json.result.message_id : null;
    return { platform: 'telegram', success: true, messageId: msgId, raw: json };
  } catch (e) {
    return { platform: 'telegram', success: false, error: e.message };
  }
}

module.exports = { postToTelegram };
