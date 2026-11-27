// discordService.js - Discord webhook and bot posting
const { db } = require("../firebaseAdmin");
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
async function postToDiscord(args) {
  return require("./communityDelivery").deliver({ ...args, payload: args.payload || args, platform: "discord" });
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
  postViaBot,
  createEmbed,
  getMessage,
};

// Helper: find hashtag string inside 'payload' like field
function _payloadHashtagString(payload) {
  try {
    if (!payload) return "";
    if (typeof payload === "string") return payload;
    if (payload.hashtagString) return " " + payload.hashtagString;
    if (payload.hashtags && Array.isArray(payload.hashtags))
      return " " + payload.hashtags.join(" ");
  } catch (_) {}
  return "";
}
void _payloadHashtagString;
