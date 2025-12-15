# AutoPromote Platform Usage Guide

## Quick Start: How to Use Each Platform

All 7 platforms are now production-ready and can actually post content (no more simulations!).

---

## 1. YouTube - Video Platform

### Post a Video

```javascript
const { uploadVideo } = require("./src/services/youtubeService");

await uploadVideo({
  uid: "user123",
  title: "My Amazing Video",
  description: "Check out this content!",
  fileUrl: "https://example.com/video.mp4",
  contentId: "content456",
  shortsMode: false, // Set true for YouTube Shorts
  optimizeMetadata: true,
});
```

### Track Video Performance

```javascript
const { fetchVideoStats } = require("./src/services/youtubeService");

const stats = await fetchVideoStats({
  uid: "user123",
  videoId: "abc123xyz",
});
// Returns: views, likes, comments, etc.
```

---

## 2. Twitter - Microblogging

### Post a Tweet

```javascript
const { postTweet } = require("./src/services/twitterService");

await postTweet({
  uid: "user123",
  text: "Check out my new content! 🚀",
  contentId: "content456",
});
```

### Post Tweet with Image

```javascript
const { uploadMedia, postTweet } = require("./src/services/twitterService");

// First upload the media
const mediaId = await uploadMedia({
  uid: "user123",
  mediaUrl: "https://example.com/image.jpg",
  mediaType: "image/jpeg",
});

// Then post tweet with media
await postTweet({
  uid: "user123",
  text: "Amazing visual! 📸",
  mediaIds: [mediaId],
  contentId: "content456",
});
```

### Get Tweet Stats

```javascript
const { getTweetStats } = require("./src/services/twitterService");

const stats = await getTweetStats({
  uid: "user123",
  tweetId: "1234567890",
});
// Returns: likes, retweets, replies, views
```

---

## 3. LinkedIn - Professional Network

### Post Text Update

```javascript
const { postToLinkedIn } = require("./src/services/linkedinService");

await postToLinkedIn({
  uid: "user123",
  text: "Excited to announce my latest project! 💼",
  contentId: "content456",
});
```

### Post with Image

```javascript
await postToLinkedIn({
  uid: "user123",
  text: "Check out our new product design!",
  imageUrl: "https://example.com/product.jpg",
  contentId: "content456",
});
```

### Share Article

```javascript
await postToLinkedIn({
  uid: "user123",
  text: "Great insights on industry trends",
  articleUrl: "https://example.com/article",
  articleTitle: "Industry Trends 2025",
  articleDescription: "A comprehensive analysis...",
  contentId: "content456",
});
```

### Get Post Stats

```javascript
const { getPostStats } = require("./src/services/linkedinService");

const stats = await getPostStats({
  uid: "user123",
  shareId: "urn:li:share:123456",
});
// Returns: likes, comments
```

---

## 4. Discord - Community Platform

### Post via Webhook (Recommended)

```javascript
const { postToDiscord } = require("./src/services/discordService");

await postToDiscord({
  uid: "user123",
  content: "New content alert! 🎮",
  title: "Check This Out",
  description: "Amazing new content just dropped",
  imageUrl: "https://example.com/image.jpg",
  webhookUrl: "https://discord.com/api/webhooks/123/abc",
  contentId: "content456",
});
```

### Post via Bot

```javascript
await postToDiscord({
  uid: "user123",
  content: "New announcement!",
  title: "Important Update",
  description: "Here are the details...",
  channelId: "987654321",
  contentId: "content456",
});
// Requires DISCORD_BOT_TOKEN in environment
```

### Create Rich Embed

```javascript
const { createEmbed } = require("./src/services/discordService");

const embed = createEmbed({
  title: "New Video Released",
  description: "Watch my latest content",
  url: "https://youtube.com/watch?v=...",
  color: 0xff0000, // Red
  imageUrl: "https://example.com/thumbnail.jpg",
  footer: "Posted via AutoPromote",
  fields: [
    { name: "Duration", value: "10:30", inline: true },
    { name: "Category", value: "Tech", inline: true },
  ],
});
```

---

## 5. Reddit - Community Discussion

### Post Text (Self Post)

```javascript
const { postToReddit } = require("./src/services/redditService");

await postToReddit({
  uid: "user123",
  subreddit: "technology",
  title: "My thoughts on the latest tech trends",
  text: "Here are my detailed thoughts on...",
  kind: "self",
  contentId: "content456",
});
```

### Post Link

```javascript
await postToReddit({
  uid: "user123",
  subreddit: "videos",
  title: "Amazing video you need to see",
  url: "https://youtube.com/watch?v=...",
  kind: "link",
  contentId: "content456",
});
```

### Validate Subreddit First

```javascript
const { getSubredditInfo } = require("./src/services/redditService");

const info = await getSubredditInfo({
  uid: "user123",
  subreddit: "technology",
});
// Returns: subscribers, rules, allowImages, allowVideos, etc.
```

### Get Post Stats

```javascript
const { getPostInfo } = require("./src/services/redditService");

const stats = await getPostInfo({
  uid: "user123",
  postId: "t3_abc123",
});
// Returns: score, upvoteRatio, numComments
```

---

## 6. Spotify - Music Platform

### Create Playlist

```javascript
const { postToSpotify } = require("./src/services/spotifyService");

await postToSpotify({
  uid: "user123",
  name: "My Awesome Playlist",
  description: "A collection of great tracks",
  contentId: "content456",
});
```

### Create Playlist with Tracks

```javascript
const { searchTracks, postToSpotify } = require("./src/services/spotifyService");

// Search for tracks
const results = await searchTracks({
  uid: "user123",
  query: "chill vibes",
  limit: 20,
});

// Create playlist with found tracks
await postToSpotify({
  uid: "user123",
  name: "Chill Vibes Collection",
  description: "Relaxing music for work",
  trackUris: results.tracks.map(t => t.uri),
  contentId: "content456",
});
```

### Add Tracks to Existing Playlist

```javascript
const { addTracksToPlaylist } = require("./src/services/spotifyService");

await addTracksToPlaylist({
  uid: "user123",
  playlistId: "37i9dQZF1DXcBWIGoYBM5M",
  trackUris: ["spotify:track:abc123", "spotify:track:def456"],
});
```

---

## 7. Telegram - Messaging

### Send Message

```javascript
const { postToTelegram } = require("./src/services/telegramService");

await postToTelegram({
  uid: "user123",
  payload: {
    text: "New content notification! 📢",
  },
});
```

---

## Integration with AutoPromote's Promotion System

### Automatic Cross-Platform Posting

When content goes viral on YouTube, AutoPromote can automatically post to other platforms:

```javascript
// This happens automatically in youtubeService.js when velocity threshold is hit
const { enqueuePlatformPostTask } = require("./services/promotionTaskQueue");

// Enqueue posts to all platforms
const platforms = ["twitter", "linkedin", "discord", "reddit"];
for (const platform of platforms) {
  await enqueuePlatformPostTask({
    contentId: "content456",
    uid: "user123",
    platform,
    reason: "youtube_velocity_high",
    payload: {
      sourceVideoId: "abc123",
      velocity: 1500,
    },
  });
}
```

---

## Platform-Specific Best Practices

### Twitter

- Keep tweets under 280 characters
- Use hashtags strategically
- Include media for better engagement
- Post during peak hours

### LinkedIn

- Professional tone
- Longer-form content works well
- Use articles for thought leadership
- Tag relevant connections

### Discord

- Use embeds for rich content
- Keep messages concise
- Use webhooks for automation
- Consider channel-specific content

### Reddit

- Follow subreddit rules strictly
- Avoid self-promotion in some subreddits
- Engage with comments
- Use appropriate flair

### Spotify

- Curate playlists thoughtfully
- Update descriptions regularly
- Consider playlist cover images
- Engage with followers

---

## Error Handling

All platforms return consistent error structures:

```javascript
try {
  const result = await postToTwitter({ ... });
  console.log('Success:', result.tweetId);
} catch (error) {
  console.error('Failed:', error.message);
  // Handle specific errors:
  // - 'No valid access token' -> User needs to reconnect
  // - 'Token expired' -> Trigger re-authentication
  // - 'API rate limit' -> Retry later
}
```

---

## Rate Limits

Be aware of platform rate limits:

- **Twitter:** 50 tweets per 24 hours (user context)
- **LinkedIn:** ~100 posts per day
- **Discord:** 5 messages per 5 seconds (webhook), 50 per second (bot)
- **Reddit:** 1 post per 10 minutes (new accounts), varies by karma
- **Spotify:** 100 requests per 30 seconds

---

## Monitoring & Analytics

Track posting success across platforms:

```javascript
// Check content document for all platform posts
const contentDoc = await db.collection("content").doc("content456").get();
const data = contentDoc.data();

console.log("YouTube:", data.youtube?.videoId);
console.log("Twitter:", data.twitter?.tweetId);
console.log("LinkedIn:", data.linkedin?.shareId);
console.log("Discord:", data.discord?.messageId);
console.log("Reddit:", data.reddit?.postId);
console.log("Spotify:", data.spotify?.playlistId);
```

---

## Troubleshooting

### "No valid access token"

- User needs to reconnect their account
- Token may have expired
- Check OAuth scopes are correct

### "API rate limit exceeded"

- Implement exponential backoff
- Queue posts for later
- Spread posts across time

### "Permission denied"

- Check OAuth scopes
- Verify API credentials
- Ensure user has necessary permissions

### "Media upload failed"

- Check file size limits
- Verify media URL is accessible
- Check media format is supported

---

**All platforms are now ready for production use!**

---

## Per-Platform Upload Metadata (platform_options)

When the upload UI sends content to the backend, it uses a `platform_options` map to include per-platform metadata and options. Example payload:

```json
{
  "title": "My Content",
  "type": "video",
  "url": "https://...",
  "target_platforms": ["youtube", "discord", "spotify"],
  "platform_options": {
    "discord": { "channelId": "123456789", "guildId": "987654321" },
    "spotify": { "name": "My Playlist" },
    "youtube": { "shortsMode": true }
  }
}
```

Common platform options:

- `discord.channelId` (required when posting to a specific channel)
- `discord.guildId` (optional, used to indicate the server)
- `telegram.chatId` (required for Telegram messages)
- `reddit.subreddit` (required when posting to a subreddit)
- `spotify.name` (required for playlist creation)
- `linkedin.companyId` (optional — post as organization)
- `linkedin.personId` (optional — post as person)
- `youtube.shortsMode` (boolean — short videos / #shorts)

Use the dropdown/helpers in the dashboard to prefill these values when your platform connection supports metadata (Spotify playlists, Discord guilds, LinkedIn organizations, Telegram chatId). The dashboard calls `/api/:platform/metadata` to fetch available options.

---

For more advanced options or for adding more platforms, use the `platform_options` map and the queued posting system to ensure consistent delivery and reliable retries.
