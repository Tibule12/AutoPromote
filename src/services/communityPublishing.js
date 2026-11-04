// Publishing authority comes from provider-verified, owner-scoped destinations.
// Account identity alone never authorises an arbitrary channel or webhook.
const crypto = require("crypto");
const { db } = require("../firebaseAdmin");
const vault = require("./secretVault");
const { publishingError } = require("./publishingTaskErrors");

const idOf = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const fail = (message, kind = "validation", status = 409) => publishingError(message, kind, status);
const snowflake = value => /^\d{5,22}$/.test(String(value || ""));
const OAUTH_ERROR_CODES = new Set([
  "invalid_client",
  "invalid_grant",
  "invalid_scope",
  "invalid_request",
  "access_denied",
]);
function discordFailure(code, message, status = 400) {
  const error = fail(message, "auth", status);
  error.discordCode = code;
  return error;
}
async function discordStage(code, action) {
  try {
    return await action();
  } catch (error) {
    error.discordCode ||= code;
    throw error;
  }
}
function describeDiscordFailure(error) {
  // Public support codes are a closed vocabulary. Never return provider bodies,
  // callback parameters, raw exception messages or OAuth/webhook credentials.
  const messages = {
    invalid_request:
      "This Discord connection link is invalid. Start Connect again from AutoPromote.",
    state_unavailable:
      "This Discord connection was already used or is no longer available. Start Connect again from AutoPromote.",
    state_expired:
      "This Discord connection expired after 10 minutes. Start a fresh connection from AutoPromote.",
    client_changed:
      "The Discord connection settings changed. Start a fresh connection from AutoPromote.",
    encryption_unavailable:
      "Discord connection storage is temporarily unavailable. Please contact AutoPromote support.",
    connection_limit:
      "Your account could not authorise another publishing connection. Return to AutoPromote to review your connections.",
    state_lookup: "The connection could not be checked. Start Connect again from AutoPromote.",
    token_exchange:
      "Discord did not accept this authorisation. Start Connect again from AutoPromote.",
    webhook_missing:
      "Discord did not authorise a publishing channel. Start Connect again and select a server and channel.",
    webhook_contract:
      "Discord's channel authorisation could not be verified. Please contact AutoPromote support.",
    webhook_fields:
      "Discord returned incomplete publishing channel details. Please contact AutoPromote support.",
    webhook_application:
      "Discord returned a channel for a different application. Please contact AutoPromote support.",
    grant_lookup:
      "Discord's application authorisation could not be checked. Start Connect again from AutoPromote.",
    grant_application:
      "Discord's authorisation does not match AutoPromote. Please contact AutoPromote support.",
    grant_scopes:
      "Discord's signed-in identity permission could not be verified. Start Connect again from AutoPromote.",
    grant_expired: "Discord's authorisation has expired. Start Connect again from AutoPromote.",
    webhook_lookup:
      "Discord's publishing channel could not be checked. Start Connect again from AutoPromote.",
    webhook_binding:
      "Discord's publishing channel details do not match the authorisation. Please contact AutoPromote support.",
    identity_lookup:
      "Your Discord identity could not be verified. Start Connect again from AutoPromote.",
    connection_storage:
      "The Discord connection could not be saved. Please contact AutoPromote support.",
  };
  const code = Object.hasOwn(messages, error?.discordCode) ? error.discordCode : "callback_failed";
  return {
    code,
    message:
      messages[code] ||
      "Discord publishing authorisation failed. Start Connect again from AutoPromote.",
    ...(OAUTH_ERROR_CODES.has(error?.oauthError) ? { providerCode: error.oauthError } : {}),
  };
}
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
    const error = fail(
      status === 429
        ? "Provider rate limit reached."
        : "Provider denied access. Check channel permissions and reconnect.",
      status === 429 ? "rate_limit" : status >= 500 ? "transient" : "auth",
      status
    );
    if (OAUTH_ERROR_CODES.has(json?.error)) error.oauthError = json.error;
    throw error;
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
    // New grants are bound to the app through Discord's authenticated OAuth
    // information. A webhook's application_id is documented as nullable.
    // Historical destinations retain their original, stricter app-ID check.
    const verifiedGrant =
      d.verificationVersion === 2 && d.oauthApplicationId === process.env.DISCORD_CLIENT_ID;
    if (
      String(hook.id) !== d.webhookId ||
      String(hook.channel_id) !== d.targetId ||
      (d.verificationVersion === 2 && !verifiedGrant) ||
      (verifiedGrant && (hook.type !== 1 || String(hook.guild_id) !== d.guildId)) ||
      (hook.application_id != null
        ? String(hook.application_id) !== String(process.env.DISCORD_CLIENT_ID)
        : !verifiedGrant)
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
    throw discordFailure("invalid_request", "Invalid Discord connection. Start again.");
  if (!vault.hasEncryption())
    throw discordFailure("encryption_unavailable", "Server token encryption is required.", 503);
  const ref = db.collection("oauth_states").doc(state);
  const s = await discordStage("state_lookup", () =>
    db.runTransaction(async tx => {
      const snap = await tx.get(ref),
        data = snap.exists && snap.data();
      if (
        !data ||
        data.platform !== "discord" ||
        data.purpose !== "publishing_webhook" ||
        !data.uid
      )
        throw discordFailure("state_unavailable", "Invalid Discord connection. Start again.");
      if (!Number.isFinite(data.expiresAt) || data.expiresAt <= Date.now())
        throw discordFailure("state_expired", "Expired Discord connection. Start again.");
      if (data.clientId !== process.env.DISCORD_CLIENT_ID)
        throw discordFailure("client_changed", "Discord connection settings changed. Start again.");
      tx.delete(ref);
      return data;
    })
  );
  await discordStage("connection_limit", () =>
    require("./billingService").checkConnectionLimit(s.uid, "discord")
  );
  const token = await discordStage("token_exchange", () =>
    provider("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: s.redirect,
        client_id: s.clientId,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
      }),
    })
  );
  const h = token.webhook;
  if (!h)
    throw discordFailure("webhook_missing", "Discord did not authorise a publishing channel.");
  if (
    typeof token.access_token !== "string" ||
    !token.access_token ||
    !snowflake(h.id) ||
    !snowflake(h.channel_id) ||
    !/^[\w.-]{20,200}$/.test(h.token || "")
  )
    throw discordFailure(
      "webhook_fields",
      "Discord returned incomplete publishing channel details."
    );
  if (h.application_id != null && String(h.application_id) !== String(s.clientId))
    throw discordFailure("webhook_application", "Discord webhook application mismatch.");
  // Do not use nullable webhook.application_id or the token response's optional
  // scope echo as the sole application/permission authority. Verify the actual
  // grant with Discord, including the identity belonging to that same token.
  const grant = await discordStage("grant_lookup", () =>
    provider("https://discord.com/api/v10/oauth2/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
  );
  if (String(grant.application?.id) !== String(s.clientId))
    throw discordFailure("grant_application", "Discord OAuth application mismatch.");
  // webhook.incoming is a passthrough authorisation that issues the webhook
  // capability; it need not remain in the bearer's scope list. Publishing
  // authority is the webhook returned by this bound code exchange AND the live
  // capability verification below, never the scope echo or a browser claim.
  if (!Array.isArray(grant.scopes) || !grant.scopes.includes("identify"))
    throw discordFailure("grant_scopes", "Discord identity permission was not granted.");
  if (!Number.isFinite(Date.parse(grant.expires)) || Date.parse(grant.expires) <= Date.now())
    throw discordFailure("grant_expired", "Discord OAuth grant expired.");
  const identity = grant.user;
  if (!snowflake(identity?.id))
    throw discordFailure("identity_lookup", "Discord identity could not be verified.");
  // Only contact a canonical Discord endpoint assembled from validated fields,
  // never a provider-supplied URL. This GET does not send a test message.
  const liveHook = await discordStage("webhook_lookup", () =>
    provider(`https://discord.com/api/v10/webhooks/${h.id}/${h.token}`)
  );
  if (
    liveHook.type !== 1 ||
    String(liveHook.id) !== String(h.id) ||
    String(liveHook.channel_id) !== String(h.channel_id) ||
    !snowflake(liveHook.guild_id) ||
    (h.guild_id != null && String(h.guild_id) !== String(liveHook.guild_id)) ||
    (liveHook.application_id != null && String(liveHook.application_id) !== String(s.clientId))
  )
    throw discordFailure("webhook_binding", "Discord live webhook binding mismatch.");
  const encryptedWebhookToken = vault.encryptToken(h.token);
  if (!encryptedWebhookToken || encryptedWebhookToken === h.token)
    throw discordFailure(
      "encryption_unavailable",
      "Could not securely store channel authorisation.",
      503
    );
  const d = {
    id: idOf(h.channel_id),
    platform: "discord",
    targetId: String(h.channel_id),
    label: h.name || `Discord channel ${h.channel_id}`,
    type: "channel",
    webhookId: String(h.id),
    guildId: String(liveHook.guild_id),
    verificationVersion: 2,
    oauthApplicationId: String(grant.application.id),
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
  await discordStage("connection_storage", () => batch.commit());
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
  describeDiscordFailure,
};
