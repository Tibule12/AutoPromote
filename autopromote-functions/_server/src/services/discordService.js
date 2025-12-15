// discordService.js - Discord webhook and bot posting
const { db, admin } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");

let fetchFn = global.fetch;
if (!fetchFn) {
  try {
    fetchFn = require("node-fetch");
  } catch (e) {
    fetchFn = null;
  }
}

/**
 * Get user's Discord connection
 */
const { tokensFromDoc } = require("./connectionTokenUtils");

async function getUserDiscordConnection(uid) {
  const snap = await db.collection("users").doc(uid).collection("connections").doc("discord").get();
  if (!snap.exists) return null;
  const d = snap.data();
  const tokens = tokensFromDoc(d);
  if (tokens) d.tokens = tokens;
  return d;
}

/**
 * Post to Discord via webhook
 * Webhooks are the simplest way to post to Discord channels
 */
async function postViaWebhook({ webhookUrl, content, embeds, username, avatarUrl }) {
  if (!fetchFn) throw new Error("Fetch not available");
  if (!webhookUrl) throw new Error("webhookUrl required");

  const payload = {};

  if (content) payload.content = content;
  if (username) payload.username = username;
  if (avatarUrl) payload.avatar_url = avatarUrl;
  if (embeds && embeds.length > 0) payload.embeds = embeds;

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discord webhook failed: ${error}`);
  }

  // Discord webhooks return 204 No Content on success
  return {
    success: true,
    status: response.status,
  };
}

/**
 * Post to Discord via Bot API
 * Requires bot token and channel ID
 */
async function postViaBot({ botToken, channelId, content, embeds }) {
  if (!fetchFn) throw new Error("Fetch not available");
  if (!botToken) throw new Error("botToken required");
  if (!channelId) throw new Error("channelId required");

  const payload = {};
  if (content) payload.content = content;
  if (embeds && embeds.length > 0) payload.embeds = embeds;

  const response = await safeFetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    fetchFn,
    {
      fetchOptions: {
        method: "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      requireHttps: true,
      allowHosts: ["discord.com"],
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discord bot posting failed: ${error}`);
  }

  const data = await response.json();
  return {
    success: true,
    messageId: data.id,
    channelId: data.channel_id,
    timestamp: data.timestamp,
  };
}

/**
 * Create a Discord embed (rich message)
 */
function createEmbed({ title, description, url, color, imageUrl, thumbnailUrl, footer, fields }) {
  const embed = {};

  if (title) embed.title = title.substring(0, 256); // Discord limit
  if (description) embed.description = description.substring(0, 4096); // Discord limit
  if (url) embed.url = url;
  if (color) embed.color = color; // Integer color (e.g., 0x00FF00 for green)
  if (imageUrl) embed.image = { url: imageUrl };
  if (thumbnailUrl) embed.thumbnail = { url: thumbnailUrl };
  if (footer) embed.footer = { text: footer.substring(0, 2048) };
  if (fields && Array.isArray(fields)) {
    embed.fields = fields.slice(0, 25).map(f => ({
      // Max 25 fields
      name: f.name.substring(0, 256),
      value: f.value.substring(0, 1024),
      inline: f.inline || false,
    }));
  }

  embed.timestamp = new Date().toISOString();

  return embed;
}

/**
 * Main posting function for Discord
 */
async function postToDiscord({
  uid,
  content,
  title,
  description,
  url,
  imageUrl,
  contentId,
  webhookUrl,
  channelId,
  hashtags = [],
  hashtagString = "",
}) {
  if (!uid && !webhookUrl) throw new Error("uid or webhookUrl required");
  if (!content && !title) throw new Error("content or title required");
  if (!fetchFn) throw new Error("Fetch not available");

  let connection = null;
  let userWebhookUrl = webhookUrl;
  let userChannelId = channelId;

  // Get user's Discord connection if uid provided
  if (uid) {
    connection = await getUserDiscordConnection(uid);
    if (connection) {
      // Check for stored webhook URL or channel ID
      userWebhookUrl = userWebhookUrl || connection.webhookUrl || connection.meta?.webhookUrl;
      userChannelId = userChannelId || connection.channelId || connection.meta?.channelId;
    }
  }

  // Create embed for rich content
  const embeds = [];
  if (title || description || imageUrl) {
    embeds.push(
      createEmbed({
        title,
        description,
        url,
        imageUrl,
        color: 0x5865f2, // Discord blurple color
      })
    );
  }

  let result;
  let messageId = null;
  let postedVia = null;

  // Try webhook first (simpler, no auth needed)
  if (userWebhookUrl) {
    try {
      result = await postViaWebhook({
        webhookUrl: userWebhookUrl,
        content:
          (content || "") +
          (hashtagString
            ? ` ${hashtagString}`
            : hashtags && hashtags.length
              ? ` ${hashtags.join(" ")}`
              : ""),
        embeds: embeds.length > 0 ? embeds : null,
        username: "AutoPromote",
        avatarUrl: null,
      });
      postedVia = "webhook";
    } catch (e) {
      console.warn("[Discord] Webhook posting failed:", e.message);
      // Fall through to bot method
    }
  }

  // Try bot method if webhook failed or not available
  if (!result && userChannelId) {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (botToken) {
      try {
        result = await postViaBot({
          botToken,
          channelId: userChannelId,
          content:
            (content || "") +
            (hashtagString
              ? ` ${hashtagString}`
              : hashtags && hashtags.length
                ? ` ${hashtags.join(" ")}`
                : ""),
          embeds: embeds.length > 0 ? embeds : null,
        });
        messageId = result.messageId;
        postedVia = "bot";
      } catch (e) {
        throw new Error(`Discord bot posting failed: ${e.message}`);
      }
    } else {
      throw new Error("No Discord bot token configured");
    }
  }

  if (!result) {
    throw new Error("No Discord webhook URL or channel ID available");
  }

  // Store post info in Firestore if contentId provided
  if (contentId && uid) {
    try {
      const contentRef = db.collection("content").doc(contentId);
      const existing = await contentRef.get();
      const existingData = existing.exists ? existing.data().discord || {} : {};

      await contentRef.set(
        {
          discord: {
            ...existingData,
            messageId: messageId || "webhook-post",
            channelId: userChannelId || "unknown",
            content: content || title || "",
            postedAt: new Date().toISOString(),
            postedVia,
            createdAt: existingData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("[Discord] Failed to store post info in Firestore:", e.message);
    }
  }

  return {
    success: true,
    platform: "discord",
    messageId: messageId || "webhook-post",
    channelId: userChannelId,
    postedVia,
    raw: result,
  };
}

/**
 * Get Discord message (requires bot token)
 */
async function getMessage({ channelId, messageId }) {
  if (!channelId) throw new Error("channelId required");
  if (!messageId) throw new Error("messageId required");
  if (!fetchFn) throw new Error("Fetch not available");

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) throw new Error("Discord bot token not configured");

  const response = await safeFetch(
    `https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`,
    fetchFn,
    {
      fetchOptions: {
        method: "GET",
        headers: {
          Authorization: `Bot ${botToken}`,
        },
      },
      requireHttps: true,
      allowHosts: ["discord.com"],
    }
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Discord message");
  }

  const data = await response.json();

  return {
    messageId: data.id,
    content: data.content,
    embeds: data.embeds,
    timestamp: data.timestamp,
    reactions: data.reactions || [],
  };
}

module.exports = {
  getUserDiscordConnection,
  postToDiscord,
  postViaWebhook,
  postViaBot,
  createEmbed,
  getMessage,
};

// Helper: find hashtag string inside 'payload' like field
function payloadHashtagString(payload) {
  try {
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    if (payload.hashtagString) return " " + payload.hashtagString;
    if (payload.hashtags && Array.isArray(payload.hashtags))
      return " " + payload.hashtags.join(" ");
  } catch (_) {}
  return "";
}
