// Publishing authority comes from provider-verified, owner-scoped destinations.
// Account identity alone never authorises an arbitrary channel or webhook.
const crypto = require("crypto");
const { db } = require("../firebaseAdmin");
const vault = require("./secretVault");
const { publishingError } = require("./publishingTaskErrors");

const idOf = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const fail = (message, kind = "validation", status = 409) => publishingError(message, kind, status);
const snowflake = value => /^\d{5,22}$/.test(String(value || ""));
const connection = (uid, platform) =>
  db.collection("users").doc(uid).collection("connections").doc(platform);
const destinations = (uid, platform) =>
  connection(uid, platform).collection("publishingDestinations");
const publicDestination = d => ({
  id: d.id,
  platform: d.platform,
  targetId: d.targetId,
  label: d.label,
  type: d.type,
  verifiedAt: d.verifiedAt,
  deliveryMode: d.deliveryMode || "native",
});

async function provider(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
  } catch (_) {
    throw fail("Provider connection failed. Try again.", "transient", 503);
  }
  const json = await response.json().catch(() => null);
  if (!response.ok || !json || json.ok === false) {
    const status = json?.error_code || response.status;
    throw fail(
      status === 429
        ? "Provider rate limit reached."
        : "Provider denied access. Check channel permissions and reconnect.",
      status === 429 ? "rate_limit" : status >= 500 ? "transient" : "auth",
      status
    );
  }
  return json;
}
async function telegram(method, args) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw fail("Telegram bot is not configured.", "auth");
  return (
    await provider(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    })
  ).result;
}
async function verifyTelegramDestination(uid, target) {
  const snap = await connection(uid, "telegram").get();
  const c = snap.exists && snap.data();
  const userId = c?.profile?.id || c?.userId || c?.meta?.chatId;
  if (!c || c.connected === false || !userId)
    throw fail("Connect your Telegram account first.", "auth");
  if (!/^(?:@\w{5,32}|-?\d{1,20})$/.test(String(target || "")))
    throw fail("Enter a Telegram channel username or chat ID.");
  const chat = await telegram("getChat", { chat_id: target });
  if (chat.type === "private") {
    if (String(chat.id) !== String(userId))
      throw fail("Choose your own bot conversation or a channel you administer.", "auth");
  } else {
    if (!["channel", "group", "supergroup"].includes(chat.type))
      throw fail("Unsupported Telegram destination.");
    const me = await telegram("getMe", {});
    const member = await telegram("getChatMember", { chat_id: chat.id, user_id: userId });
    const bot = await telegram("getChatMember", { chat_id: chat.id, user_id: me.id });
    if (!["creator", "administrator"].includes(member?.status))
      throw fail("You must administer this Telegram destination.", "auth");
    if (chat.type === "channel" && member.status !== "creator" && member.can_post_messages !== true)
      throw fail("Your Telegram administrator role must allow posting in this channel.", "auth");
    const botAdmin = ["administrator", "creator"].includes(bot?.status);
    if (
      chat.type === "channel"
        ? !botAdmin || bot.can_post_messages !== true
        : !botAdmin && bot.status !== "member"
    )
      throw fail("Add AutoPromote Bot with permission to post in this destination.", "auth");
    if (
      chat.type !== "channel" &&
      !botAdmin &&
      ["can_send_messages", "can_send_photos", "can_send_videos"].some(
        k => chat.permissions?.[k] === false
      )
    )
      throw fail("Allow AutoPromote Bot to send messages, photos and videos.", "auth");
  }
  return {
    id: idOf(chat.id),
    platform: "telegram",
    targetId: String(chat.id),
    ownerProviderUserId: String(userId),
    label: chat.title || chat.username || "My private bot conversation",
    type: chat.type,
    verifiedAt: new Date().toISOString(),
  };
}
async function addTelegramDestination(uid, target) {
  const d = await verifyTelegramDestination(uid, target);
  await destinations(uid, "telegram").doc(d.id).set(d);
  return publicDestination(d);
}
async function consumeTelegramConnection(state, message) {
  if (
    !/^[\w-]{20,100}$/.test(String(state || "")) ||
    message?.chat?.type !== "private" ||
    String(message.from?.id) !== String(message.chat.id)
  )
    throw fail("Use the connection link in your private bot conversation.", "auth");
  const ref = db.collection("oauth_states").doc(state);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref),
      s = snap.exists && snap.data();
    const expiresAt = typeof s?.expiresAt === "number" ? s.expiresAt : Date.parse(s?.expiresAt);
    if (
      !s ||
      s.platform !== "telegram" ||
      typeof s.uid !== "string" ||
      !s.uid ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now()
    )
      throw fail("Invalid or expired Telegram connection. Start again.", "auth");
    const user = message.from,
      now = new Date().toISOString();
    tx.set(
      connection(s.uid, "telegram"),
      {
        connected: true,
        profile: {
          id: user.id,
          username: user.username || null,
          first_name: user.first_name || null,
          last_name: user.last_name || null,
        },
        meta: {
          chatId: message.chat.id,
          via: "deep_link",
          auth_date: Math.floor(Date.now() / 1000),
        },
        connectedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    tx.delete(ref);
    return s.uid;
  });
}
async function listDestinations(uid, platform) {
  const c = await connection(uid, platform).get();
  if (!c.exists || c.data().connected === false) return [];
  const snap = await destinations(uid, platform).limit(100).get();
  const identity =
    platform === "discord" ? c.data().meta?.id : c.data().profile?.id || c.data().meta?.chatId;
  return snap.docs
    .filter(d => d.data().ownerProviderUserId === String(identity))
    .map(d => publicDestination({ ...d.data(), id: d.id }));
}
async function resolveDestination(uid, platform, options = {}) {
  let destinationId = options.destinationId;
  // Historical schedules can use a channel ID only if it was independently authorised.
  if (!destinationId && (options.chatId || options.channelId))
    destinationId = idOf(options.chatId || options.channelId);
  if (!/^[a-f0-9]{64}$/.test(destinationId || ""))
    throw fail(`Choose and verify a ${platform} publishing destination.`);
  const c = await connection(uid, platform).get();
  if (!c.exists || c.data().connected === false) throw fail(`Reconnect ${platform}.`, "auth");
  const snap = await destinations(uid, platform).doc(destinationId).get();
  if (!snap.exists) throw fail("This destination is not authorised for your account.", "auth");
  const d = { ...snap.data(), id: destinationId };
  if (d.platform !== platform) throw fail("Destination platform mismatch.", "auth");
  const identity =
    platform === "discord" ? c.data().meta?.id : c.data().profile?.id || c.data().meta?.chatId;
  if (d.ownerProviderUserId !== String(identity))
    throw fail("Authorise this destination with the currently connected account.", "auth");
  if (platform === "telegram") await verifyTelegramDestination(uid, d.targetId);
  else {
    const url = webhookUrl(d);
    const hook = await provider(url);
    if (
      String(hook.id) !== d.webhookId ||
      String(hook.channel_id) !== d.targetId ||
      String(hook.application_id) !== String(process.env.DISCORD_CLIENT_ID)
    )
      throw fail("Discord channel authorisation changed. Reconnect.", "auth");
  }
  return d;
}
async function recordScheduleOutcome(task, outcome) {
  const scheduleId = task.payload?.scheduleId;
  if (!["telegram", "discord"].includes(task.platform) || !/^[\w-]{1,150}$/.test(scheduleId || ""))
    return;
  const ref = db.collection("promotion_schedules").doc(scheduleId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref),
      s = snap.exists && snap.data();
    if (
      !s ||
      (s.user_id || s.userId || s.uid) !== task.uid ||
      s.contentId !== task.contentId ||
      s.platform !== task.platform ||
      s.result?.taskId !== task.id
    )
      return;
    const settings = s.platformSpecificSettings || {};
    const destinationId =
      settings.destinationId || idOf(settings.chatId || settings.channelId || "");
    if (outcome.success && (outcome.destinationId !== destinationId || !outcome.messageId)) return;
    const patch = { publicationOutcome: outcome, publicationUpdatedAt: new Date().toISOString() };
    // A paused/cancelled schedule stays under the user's control. Historical
    // delivery evidence is still recorded without resuming it or its recurrence.
    if (["executed", "processing"].includes(s.status)) {
      patch.status = outcome.success ? "completed" : "failed";
      patch.isActive = false;
      if (outcome.error) patch.error = outcome.error;
    }
    tx.update(ref, patch);
  });
}
function webhookUrl(d) {
  if (!snowflake(d.webhookId) || !snowflake(d.targetId) || !d.encryptedWebhookToken)
    throw fail("Reconnect Discord to authorise this channel.", "auth");
  const token = vault.decryptToken(d.encryptedWebhookToken);
  if (!/^[\w.-]{20,200}$/.test(token || "")) throw fail("Reconnect Discord.", "auth");
  return `https://discord.com/api/v10/webhooks/${d.webhookId}/${token}`;
}
async function prepareDiscord(uid) {
  if (!uid) throw fail("Sign in before connecting Discord.", "auth", 401);
  if (
    !process.env.DISCORD_CLIENT_ID ||
    !process.env.DISCORD_CLIENT_SECRET ||
    !vault.hasEncryption()
  )
    throw fail("Discord publishing configuration is incomplete.", "auth", 503);
  await require("./billingService").checkConnectionLimit(uid, "discord");
  const redirect = require("../utils/redirectUri").canonicalizeRedirect(
    process.env.DISCORD_REDIRECT_URI || "https://api.autopromote.org/api/discord/auth/callback",
    { requiredPath: "/api/discord/auth/callback" }
  );
  const state = crypto.randomBytes(32).toString("base64url");
  await db
    .collection("oauth_states")
    .doc(state)
    .set({
      uid,
      platform: "discord",
      purpose: "publishing_webhook",
      clientId: process.env.DISCORD_CLIENT_ID,
      redirect,
      expiresAt: Date.now() + 600000,
    });
  const query = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: redirect,
    response_type: "code",
    scope: "identify webhook.incoming",
    state,
    prompt: "consent",
  });
  return {
    ok: true,
    platform: "discord",
    authUrl: `https://discord.com/oauth2/authorize?${query}`,
  };
}
async function completeDiscord({ state, code }) {
  if (
    !/^[\w-]{43}$/.test(String(state || "")) ||
    typeof code !== "string" ||
    !code ||
    code.length > 2048
  )
    throw fail("Invalid Discord connection. Start again.", "auth", 400);
  if (!vault.hasEncryption()) throw fail("Server token encryption is required.", "auth", 503);
  const ref = db.collection("oauth_states").doc(state);
  const s = await db.runTransaction(async tx => {
    const snap = await tx.get(ref),
      data = snap.exists && snap.data();
    if (
      !data ||
      data.platform !== "discord" ||
      data.purpose !== "publishing_webhook" ||
      !data.uid ||
      data.expiresAt <= Date.now() ||
      data.clientId !== process.env.DISCORD_CLIENT_ID
    )
      throw fail("Expired Discord connection. Start again.", "auth", 400);
    tx.delete(ref);
    return data;
  });
  await require("./billingService").checkConnectionLimit(s.uid, "discord");
  const token = await provider("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: s.redirect,
      client_id: s.clientId,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
    }),
  });
  const h = token.webhook;
  if (
    !token.access_token ||
    !String(token.scope || "")
      .split(" ")
      .includes("webhook.incoming") ||
    !h ||
    !snowflake(h.id) ||
    !snowflake(h.channel_id) ||
    !/^[\w.-]{20,200}$/.test(h.token || "") ||
    String(h.application_id) !== String(s.clientId)
  )
    throw fail("Discord did not authorise a publishing channel. Reconnect.", "auth");
  const identity = await provider("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const encryptedWebhookToken = vault.encryptToken(h.token);
  if (!encryptedWebhookToken || encryptedWebhookToken === h.token)
    throw fail("Could not securely store channel authorisation.", "auth", 503);
  const d = {
    id: idOf(h.channel_id),
    platform: "discord",
    targetId: String(h.channel_id),
    label: h.name || `Discord channel ${h.channel_id}`,
    type: "channel",
    webhookId: String(h.id),
    guildId: String(h.guild_id || ""),
    ownerProviderUserId: String(identity.id),
    encryptedWebhookToken,
    verifiedAt: new Date().toISOString(),
  };
  const batch = db.batch();
  batch.set(destinations(s.uid, "discord").doc(d.id), d);
  // Retain the existing connection-limit accounting; this grants no tier/credits.
  batch.set(
    db.collection("users").doc(s.uid),
    {
      connectedPlatforms: require("firebase-admin/firestore").FieldValue.arrayUnion("discord"),
    },
    { merge: true }
  );
  // No webhook tokens/URLs or full OAuth response in the API-readable connection.
  batch.set(
    connection(s.uid, "discord"),
    {
      connected: true,
      publishingAuthorized: true,
      meta: { id: identity.id, username: identity.username || "Discord" },
      updatedAt: d.verifiedAt,
    },
    { merge: true }
  );
  await batch.commit();
  require("../utils/simpleCache").setCache(`platform_connections_status_${s.uid}`, null, 0);
  return publicDestination(d);
}

module.exports = {
  addTelegramDestination,
  verifyTelegramDestination,
  listDestinations,
  resolveDestination,
  prepareDiscord,
  completeDiscord,
  recordScheduleOutcome,
  consumeTelegramConnection,
  webhookUrl,
  destinations,
  telegram,
  provider,
  idOf,
  publicDestination,
};
