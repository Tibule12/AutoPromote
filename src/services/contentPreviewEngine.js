// contentPreviewEngine.js
// AutoPromote Content Preview Across Platforms
// Simulates how content will appear on TikTok, Meta, YouTube, Twitter

function generatePlatformPreview(content, platform) {
  // Simulate platform-specific formatting
  return {
    platform,
    title: content.title,
    description: content.description,
    hashtags: (content.hashtags && content.hashtags[platform]) || [],
    thumbnail: content.thumbnail || `/thumbnails/${platform}_default.png`,
    sound: content.sound || (platform === 'tiktok' ? 'trending_sound.mp3' : null),
    caption: `${content.title} ${((content.hashtags && content.hashtags[platform]) || []).join(' ')}`,
    previewUrl: `/preview/${platform}/${content.id}`
  };
}

function generateAllPreviews(content) {
  const platforms = content.target_platforms || ['youtube', 'tiktok', 'instagram', 'twitter'];
  return platforms.map(platform => generatePlatformPreview(content, platform));
}

module.exports = {
  generatePlatformPreview,
  generateAllPreviews
};
