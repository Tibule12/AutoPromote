// redditService.js - Reddit submission API integration
const { db, admin } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");
const FormData = require("form-data");

let fetchFn;
try {
  fetchFn = require("node-fetch");
} catch (e) {
  fetchFn = global.fetch;
}

/**
 * Get user's Reddit connection tokens
 */
const { tokensFromDoc } = require("./connectionTokenUtils");

async function getUserRedditConnection(uid) {
  const snap = await db.collection("users").doc(uid).collection("connections").doc("reddit").get();
  if (!snap.exists) return null;
  const d = snap.data();
  const tokens = tokensFromDoc(d);
  if (tokens) d.tokens = tokens;
  return d;
}

/**
 * Get valid access token (with refresh if needed)
 */
async function getValidAccessToken(uid) {
  const connection = await getUserRedditConnection(uid);
  if (!connection || !connection.tokens) return null;

  const tokens = connection.tokens;
  const now = Date.now();

  // Check if token is still valid
  if (tokens.expires_in && tokens.access_token) {
    const expiresAt = (connection.updatedAt?._seconds || 0) * 1000 + tokens.expires_in * 1000;
    if (now < expiresAt - 300000) {
      // 5 min buffer
      return tokens.access_token;
    }
  }

  // Try to refresh token
  if (tokens.refresh_token) {
    try {
      const refreshed = await refreshToken(uid, tokens.refresh_token);
      return refreshed.access_token;
    } catch (e) {
      console.warn("[Reddit] Token refresh failed:", e.message);
    }
  }

  return tokens.access_token;
}

/**
 * Refresh Reddit access token
 */
async function refreshToken(uid, refreshToken) {
  if (!fetchFn) throw new Error("Fetch not available");

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Reddit client credentials not configured");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await safeFetch("https://www.reddit.com/api/v1/access_token", fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "AutoPromote/1.0",
      },
      body,
    },
    requireHttps: true,
    allowHosts: ["www.reddit.com"],
  });

  if (!response.ok) {
    throw new Error("Reddit token refresh failed");
  }

  const tokens = await response.json();

  // Store refreshed tokens
  const ref = db.collection("users").doc(uid).collection("connections").doc("reddit");
  try {
    const { encryptToken, hasEncryption } = require("./secretVault");
    if (hasEncryption()) {
      await ref.set(
        {
          tokens: encryptToken(JSON.stringify({ ...tokens, refresh_token: refreshToken })),
          hasEncryption: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await ref.set(
        {
          tokens: { ...tokens, refresh_token: refreshToken },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (e) {
    await ref.set(
      {
        tokens: { ...tokens, refresh_token: refreshToken },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return tokens;
}

/**
 * Upload media to Reddit's S3 bucket
 * Returns: { s3Url, asset_id } (or just s3Url for now)
 */
async function uploadRedditMedia(uid, contentUrl, mimeType) {
  if (!contentUrl) return null;
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Reddit access token for upload");

  // 1. Fetch content stream/buffer
  const filename = contentUrl.split("/").pop().split("?")[0] || "media_file";
  // Determine mimeType if not provided? For now assume caller provides or we default
  // Ideally we inspect file, but simple default is okay:
  if (!mimeType) {
    if (filename.endsWith(".mp4")) mimeType = "video/mp4";
    else if (filename.endsWith(".mov")) mimeType = "video/quicktime";
    else mimeType = "video/mp4";
  }

  const contentRes = await safeFetch(contentUrl, fetchFn);
  if (!contentRes.ok) throw new Error(`Failed to fetch media from ${contentUrl}`);

  let buffer;
  if (typeof contentRes.buffer === "function") {
    buffer = await contentRes.buffer();
  } else {
    buffer = Buffer.from(await contentRes.arrayBuffer());
  }

  // 2. Get Upload Lease
  const leaseBody = new URLSearchParams({
    filepath: filename,
    mimetype: mimeType,
  });

  const leaseRes = await safeFetch("https://oauth.reddit.com/api/media/asset.json", fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "AutoPromote/1.0",
      },
      body: leaseBody,
    },
    requireHttps: true,
    allowHosts: ["oauth.reddit.com"],
  });

  if (!leaseRes.ok) {
    const err = await leaseRes.text();
    throw new Error(`Reddit Lease failed: ${err}`);
  }

  const leaseData = await leaseRes.json();
  const s3Url = `https:${leaseData.args.action}`;
  const fields = leaseData.args.fields;

  // 3. Upload to S3
  const form = new FormData();
  for (const field of fields) {
    form.append(field.name, field.value);
  }
  form.append("file", buffer, { filename, contentType: mimeType });

  // Parse host from s3Url for allowHosts (usually reddit-uploaded-*.s3.amazonaws.com)
  const s3Host = s3Url.replace("https://", "").split("/")[0];

  const uploadRes = await safeFetch(s3Url, fetchFn, {
    fetchOptions: {
      method: "POST",
      body: form,
      headers: form.getHeaders(),
    },
    requireHttps: true,
    allowHosts: [s3Host, "amazonaws.com"],
  });

  if (!uploadRes.ok) {
    const errorText = await uploadRes.text();
    console.error("S3 Upload Error Body:", errorText);
    throw new Error(`S3 Upload failed: ${uploadRes.statusText}`);
  }

  // Construct final URL
  const keyInfo = fields.find(f => f.name === "key");
  const finalUrl = `${s3Url}/${keyInfo.value}`;

  return {
    url: finalUrl,
    assetId: leaseData.asset ? leaseData.asset.asset_id : null,
  };
}

/**
 * Submit a post to Reddit
 */
async function postToReddit({
  uid,
  subreddit,
  title,
  text,
  url,
  contentId,
  kind = "self",
  hashtags = [],
  hashtagString = "",
  videoUrl,
  thumbnailUrl,
}) {
  if (!uid) throw new Error("uid required");
  if (!subreddit) throw new Error("subreddit required");
  if (!title) throw new Error("title required");
  if (kind === "self" && !text) throw new Error("text required for self posts");
  if (kind === "link" && !url) throw new Error("url required for link posts");
  if (kind === "video" && !(url || videoUrl)) throw new Error("video url required for video posts");
  if (!fetchFn) throw new Error("Fetch not available");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Reddit access token");

  // Handle Video Upload (Native)
  let finalVideoUrl = null;
  let finalPosterUrl = null;

  if (kind === "video") {
    // 1. Upload Video
    const vSource = videoUrl || url;
    try {
      // console.log("Uploading video to standard Reddit S3...");
      const vResult = await uploadRedditMedia(uid, vSource, "video/mp4");
      finalVideoUrl = vResult.url;
    } catch (e) {
      throw new Error(`Failed to upload video to Reddit: ${e.message}`);
    }

    // 2. Upload Thumbnail (if provided, else default)
    let posterSource = thumbnailUrl;
    if (!posterSource) {
      // Use a default thumbnail if none provided (Reddit requires video_poster_url)
      posterSource =
        "https://raw.githubusercontent.com/reddit/reddit/master/r2/r2/static/images/snoo-placeholder.png";
      // Or any public reliable image.
      // Better: https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-120x120.png or similar.
      posterSource = "https://www.redditstatic.com/icon.png";
    }

    if (posterSource) {
      try {
        const tResult = await uploadRedditMedia(uid, posterSource, "image/png");
        finalPosterUrl = tResult.url;
      } catch (e) {
        console.warn("Failed to upload thumbnail:", e.message);
      }
    }
  }

  // Build submission payload
  const payload = new URLSearchParams({
    api_type: "json", // Request standard JSON response
    sr: subreddit,
    kind: kind, // 'self', 'link', 'video'
    title: title.substring(0, 300), // Reddit title limit
    sendreplies: "true",
    resubmit: "false",
  });

  if (kind === "self") {
    payload.append("text", text);
    // Append hashtags if any (format for reddit)
    try {
      if ((hashtags && hashtags.length > 0) || hashtagString) {
        const { formatHashtagsForPlatform } = require("./hashtagEngine");
        const hs = hashtagString || formatHashtagsForPlatform(hashtags, "reddit");
        if (hs) payload.append("text", "\n\n" + hs);
      }
    } catch (_) {}
  } else if (kind === "link") {
    payload.append("url", url);
    // Append hashtags to title for link posts
    if (hashtagString) payload.append("title", `${title} ${hashtagString}`.substring(0, 300));
  } else if (kind === "video") {
    payload.append("url", finalVideoUrl);
    if (finalPosterUrl) {
      payload.append("video_poster_url", finalPosterUrl);
    }
  }

  // Submit post
  const response = await safeFetch("https://oauth.reddit.com/api/submit", fetchFn, {
    fetchOptions: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "AutoPromote/1.0",
      },
      body: payload,
    },
    requireHttps: true,
    allowHosts: ["oauth.reddit.com"],
  });

  const responseText = await response.text();
  let responseData;
  try {
    responseData = JSON.parse(responseText);
  } catch (e) {
    responseData = { raw: responseText };
  }

  if (!response.ok) {
    const errorMsg = responseData.message || responseData.error || "Reddit posting failed";
    throw new Error(`Reddit posting failed: ${errorMsg}`);
  }

  if (responseData.json && responseData.json.errors && responseData.json.errors.length > 0) {
    const errs = responseData.json.errors.map(e => e[1]).join(", ");
    throw new Error(`Reddit API Error: ${errs}`);
  }

  // Reddit returns data in json.data.url format
  const postData = responseData.json?.data;
  const postId = postData?.id || postData?.name;
  const postUrl = postData?.url;
  const permalink = postData?.permalink ? `https://www.reddit.com${postData.permalink}` : postUrl;

  // Store post info in Firestore if contentId provided
  if (contentId && postId) {
    try {
      const contentRef = db.collection("content").doc(contentId);
      const existing = await contentRef.get();
      const existingData = existing.exists ? existing.data().reddit || {} : {};

      await contentRef.set(
        {
          reddit: {
            ...existingData,
            postId,
            subreddit,
            title,
            kind,
            url: permalink,
            postedAt: new Date().toISOString(),
            createdAt: existingData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
        },
        { merge: true }
      );
    } catch (e) {
      console.warn("[Reddit] Failed to store post info in Firestore:", e.message);
    }
  }

  return {
    success: true,
    platform: "reddit",
    postId,
    subreddit,
    url: permalink,
    raw: responseData,
  };
}

/**
 * Get Reddit post information
 */
async function getPostInfo({ uid, postId }) {
  if (!uid) throw new Error("uid required");
  if (!postId) throw new Error("postId required");
  if (!fetchFn) throw new Error("Fetch not available");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Reddit access token");

  // Reddit post IDs can be in format "t3_xxxxx" or just "xxxxx"
  const fullId = postId.startsWith("t3_") ? postId : `t3_${postId}`;

  const response = await safeFetch(`https://oauth.reddit.com/api/info?id=${fullId}`, fetchFn, {
    fetchOptions: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "AutoPromote/1.0",
      },
    },
    requireHttps: true,
    allowHosts: ["oauth.reddit.com"],
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Reddit post info");
  }

  const data = await response.json();
  const post = data.data?.children?.[0]?.data;

  if (!post) {
    throw new Error("Reddit post not found");
  }

  return {
    postId: post.id,
    title: post.title,
    subreddit: post.subreddit,
    author: post.author,
    score: post.score,
    upvoteRatio: post.upvote_ratio,
    numComments: post.num_comments,
    created: post.created_utc,
    url: `https://www.reddit.com${post.permalink}`,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Get subreddit information (to validate before posting)
 */
async function getSubredditInfo({ uid, subreddit }) {
  if (!uid) throw new Error("uid required");
  if (!subreddit) throw new Error("subreddit required");
  if (!fetchFn) throw new Error("Fetch not available");

  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Reddit access token");

  const response = await safeFetch(`https://oauth.reddit.com/r/${subreddit}/about`, fetchFn, {
    fetchOptions: {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "AutoPromote/1.0",
      },
    },
    requireHttps: true,
    allowHosts: ["oauth.reddit.com"],
  });

  if (!response.ok) {
    throw new Error("Subreddit not found or inaccessible");
  }

  const data = await response.json();
  const sub = data.data;

  return {
    name: sub.display_name,
    title: sub.title,
    subscribers: sub.subscribers,
    description: sub.public_description,
    over18: sub.over18,
    allowImages: sub.allow_images,
    allowVideos: sub.allow_videos,
  };
}

module.exports = {
  getUserRedditConnection,
  getValidAccessToken,
  refreshToken,
  postToReddit,
  getPostInfo,
  getSubredditInfo,
};
