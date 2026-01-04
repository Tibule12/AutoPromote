const fs = require("fs");
const fp = "autopromote-functions/index.js";
let s = fs.readFileSync(fp, "utf8");
// Insert path require after uuid-compat line
s = s.replace(
  /(const \{ v4: uuidv4 \} = require\('\.\/lib\/uuid-compat'\);\r?\n)/,
  "$1const path = require('path');\n"
);
// Insert safeExport helper before youtube upload export
s = s.replace(
  /(\/\/ Export YouTube video upload function\n)exports\.uploadVideoToYouTube = require\('\.\/youtubeUploader'\)\.uploadVideoToYouTube;\n/,
  `$1function safeExport(modulePath, exportsList) {\n  try {\n    const mod = require(modulePath);\n    if (!mod) return;\n    exportsList.forEach(e => {\n      if (typeof mod[e] !== \"undefined\") {\n        exports[e] = mod[e];\n      }\n    });\n  } catch (err) {\n    console.warn('[index] safeExport: module ' + modulePath + ' not available:', err && err.message);\n  }\n}\n\n// Export YouTube video upload function\nsafeExport('./youtubeUploader', ['uploadVideoToYouTube']);\n`
);

// Replace several direct export require lines with safeExport
s = s.replace(
  /exports\.getTikTokAuthUrl = require\('\.\/tiktokOAuth'\)\.getTikTokAuthUrl;\nexports\.tiktokOAuthCallback = require\('\.\/tiktokOAuth'\)\.tiktokOAuthCallback;/g,
  "safeExport('./tiktokOAuth', ['getTikTokAuthUrl','tiktokOAuthCallback']);"
);
s = s.replace(
  /exports\.getFacebookAuthUrl = require\('\.\/facebookOAuth'\)\.getFacebookAuthUrl;\nexports\.facebookOAuthCallback = require\('\.\/facebookOAuth'\)\.facebookOAuthCallback;/g,
  "safeExport('./facebookOAuth', ['getFacebookAuthUrl','facebookOAuthCallback']);"
);
s = s.replace(
  /exports\.getYouTubeAuthUrl = require\('\.\/youtubeOAuth'\)\.getYouTubeAuthUrl;\nexports\.youtubeOAuthCallback = require\('\.\/youtubeOAuth'\)\.youtubeOAuthCallback;/g,
  "safeExport('./youtubeOAuth', ['getYouTubeAuthUrl','youtubeOAuthCallback']);"
);

// Replace group of platform exports block
s = s.replace(
  /exports\.getPinterestAuthUrl = require\('\.\/pinterestOAuth'\)\.getPinterestAuthUrl;\nexports\.pinterestOAuthCallback = require\('\.\/pinterestOAuth'\)\.pinterestOAuthCallback;\nexports\.getDiscordAuthUrl = require\('\.\/discordOAuth'\)\.getDiscordAuthUrl;\nexports\.discordOAuthCallback = require\('\.\/discordOAuth'\)\.discordOAuthCallback;\nexports\.getSpotifyAuthUrl = require\('\.\/spotifyOAuth'\)\.getSpotifyAuthUrl;\nexports\.spotifyOAuthCallback = require\('\.\/spotifyOAuth'\)\.spotifyOAuthCallback;\nexports\.getLinkedInAuthUrl = require\('\.\/linkedinOAuth'\)\.getLinkedInAuthUrl;\nexports\.linkedinOAuthCallback = require\('\.\/linkedinOAuth'\)\.linkedinOAuthCallback;\nexports\.getRedditAuthUrl = require\('\.\/redditOAuth'\)\.getRedditAuthUrl;\nexports\.redditOAuthCallback = require\('\.\/redditOAuth'\)\.redditOAuthCallback;\nexports\.getTwitterAuthUrl = require\('\.\/twitterOAuth'\)\.getTwitterAuthUrl;\nexports\.twitterOAuthCallback = require\('\.\/twitterOAuth'\)\.twitterOAuthCallback;\nexports\.telegramWebhook = require\('\.\/telegramWebhook'\)\.telegramWebhook;\nexports\.getInstagramAuthUrl = require\('\.\/instagramOAuth'\)\.getInstagramAuthUrl;\nexports\.instagramOAuthCallback = require\('\.\/instagramOAuth'\)\.instagramOAuthCallback;\nexports\.getSnapchatAuthUrl = require\('\.\/snapchatOAuth'\)\.getSnapchatAuthUrl;\nexports\.snapchatOAuthCallback = require\('\.\/snapchatOAuth'\)\.snapchatOAuthCallback;/g,
  "safeExport('./pinterestOAuth', ['getPinterestAuthUrl','pinterestOAuthCallback']);\nsafeExport('./discordOAuth', ['getDiscordAuthUrl','discordOAuthCallback']);\nsafeExport('./spotifyOAuth', ['getSpotifyAuthUrl','spotifyOAuthCallback']);\nsafeExport('./linkedinOAuth', ['getLinkedInAuthUrl','linkedinOAuthCallback']);\nsafeExport('./redditOAuth', ['getRedditAuthUrl','redditOAuthCallback']);\nsafeExport('./twitterOAuth', ['getTwitterAuthUrl','twitterOAuthCallback']);\nsafeExport('./telegramWebhook', ['telegramWebhook']);\nsafeExport('./instagramOAuth', ['getInstagramAuthUrl','instagramOAuthCallback']);\nsafeExport('./snapchatOAuth', ['getSnapchatAuthUrl','snapchatOAuthCallback']);"
);

fs.writeFileSync(fp, s, "utf8");
console.log("Patched " + fp + " successfully");
