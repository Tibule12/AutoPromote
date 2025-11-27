const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const region = 'us-central1';

// Throttle repeated logs for invalid webhook secrets to avoid noisy logs
const TELEGRAM_WEBHOOK_WARN_THROTTLE_MS = parseInt(process.env.TELEGRAM_WEBHOOK_WARN_THROTTLE_MS || '300000', 10);
const _telegramWebhookWarnCache = new Map();
exports.telegramWebhook = functions.region(region).https.onRequest(async (req, res) => {
  // Optional secret header check
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET || null;
  if (configuredSecret) {
    const incoming = req.get('X-Telegram-Bot-Api-Secret-Token') || req.get('x-telegram-bot-api-secret-token') || req.get('x-telegram-secret-token');
    if (!incoming || String(incoming) !== String(configuredSecret)) {
      // If silent reject is enabled, return 200 OK without logging details to suppress probes
      if (process.env.TELEGRAM_WEBHOOK_SILENT_REJECT === 'true') return res.status(200).send('ok');
      try {
        const remote = (req.ip || req.get('x-forwarded-for') || 'unknown').toString();
        const key = `tg:webhook:bad_secret:${remote}`;
        const now = Date.now();
        const last = _telegramWebhookWarnCache.get(key) || 0;
        if (now - last > TELEGRAM_WEBHOOK_WARN_THROTTLE_MS) {
          console.warn('[telegram][webhook] invalid or missing secret token (throttled) ip=%s', remote);
          _telegramWebhookWarnCache.set(key, now);
        }
      } catch (_) {}
      return res.status(401).send('invalid_secret');
    }
  }
  try {
    const update = req.body || {};
    const message = update.message || update.edited_message || (update.callback_query && update.callback_query.message) || null;
    if (!message) return res.status(200).send('ok');
    const chat = message.chat || {};
    const chatId = chat.id;
    const text = (message.text || '').trim();
    let state = null;
    if (text) {
      const parts = text.split(/\s+/);
      if (parts[0] === '/start' && parts[1]) state = parts.slice(1).join(' ');
      else if (parts[0].startsWith('/start')) {
        const tail = parts[0].slice('/start'.length);
        if (tail) state = tail;
      }
    }
    // Attempt to resolve state -> uid
    let uid = null;
    if (state) {
      try {
        const sd = await admin.firestore().collection('oauth_states').doc(state).get();
        if (sd.exists) {
          const s = sd.data() || {};
          if (!s.expiresAt || new Date(s.expiresAt) > new Date()) {
            uid = s.uid || null;
          }
          try { await admin.firestore().collection('oauth_states').doc(state).delete(); } catch (_){}
        }
      } catch (e) { console.warn('[telegram][webhook] state lookup failed', e && e.message); }
    }
    if (!uid) {
      return res.status(200).send('ok');
    }
    const userRef = admin.firestore().collection('users').doc(uid);
    const now = new Date().toISOString();
    const meta = { chatId, username: (message.from && message.from.username) || null, firstName: (message.from && message.from.first_name) || null, lastName: (message.from && message.from.last_name) || null, platform: 'telegram' };
    await userRef.collection('connections').doc('telegram').set({ connected: true, chatId, meta, updatedAt: now }, { merge: true });
    try { if (admin && admin.firestore && admin.firestore.FieldValue && admin.firestore.FieldValue.arrayUnion) { await userRef.set({ connectedPlatforms: admin.firestore.FieldValue.arrayUnion('telegram') }, { merge: true }); } } catch (_){ }
    try { await admin.firestore().collection('events').add({ type: 'platform_connected', uid, platform: 'telegram', at: now }); } catch (_){ }
    return res.status(200).send('ok');
  } catch (e) {
    console.warn('[telegram][webhook] unexpected error', e && e.message);
    return res.status(200).send('ok');
  }
});
