// facebookPoster.js
// Utility to post content to a Facebook Page using the Graph API
// Usage: postToFacebook({ title, description, url, type }, pageAccessToken)

const fetch = require("node-fetch");

/**
 * Posts content to a Facebook Page.
 * @param {Object} content - The content object (title, description, url, type).
 * @param {string} pageAccessToken - Facebook Page Access Token.
 * @returns {Promise<Object>} Facebook API response.
 */
async function postToFacebook(content, pageAccessToken) {
  const pageId = process.env.FB_PAGE_ID; // Set your Facebook Page ID in env
  if (!pageId) throw new Error("FB_PAGE_ID not set in environment variables");
  if (!pageAccessToken) throw new Error("Missing Facebook Page Access Token");

  let endpoint = `https://graph.facebook.com/${pageId}/feed`;
  let body = {
    message: `${content.title}\n${content.description || ""}`.trim(),
    access_token: pageAccessToken,
  };

  // If content is an image or video, use the appropriate endpoint
  if (content.type === "image" && content.url) {
    endpoint = `https://graph.facebook.com/${pageId}/photos`;
    body.url = content.url;
  } else if (content.type === "video" && content.url) {
    endpoint = `https://graph.facebook.com/${pageId}/videos`;
    body.file_url = content.url;
    // Facebook requires 'description' for videos
    body.description = `${content.title}\n${content.description || ""}`.trim();
    delete body.message;
  } else if (content.type === "article" && content.articleText) {
    // For articles, post the text as the message
    body.message =
      `${content.title}\n${content.description || ""}\n\n${content.articleText}`.trim();
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ? data.error.message : "Facebook API error");
  }
  return data;
}

module.exports = { postToFacebook };
