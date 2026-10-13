// redditService.js - Reddit submission API integration
const { db, admin } = require("../firebaseAdmin");
const { safeFetch } = require("../utils/ssrfGuard");
const { cleanupSourceFile } = require("../utils/cleanupSource");
const FormData = require("form-data");

let fetchFn;
try {
  fetchFn = require("node-fetch");
} catch (e) {
  fetchFn = global.fetch;
}

const { createRedditVideoPoster } = require("./redditVideoPoster");

/**
 * Get user's Reddit connection tokens
 */
const { tokensFromDoc } = require("./connectionTokenUtils");
const { accessTokenExpiresAt } = require("./connectionTokenExpiry");
const { publishingError } = require("./publishingTaskErrors");
const {
  redditPostIdentity,
  waitForRedditPublication,
  findRedditPublication,
  verifyRedditVideoPublication,
} = require("./redditPublication");

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
  const expiresAt = accessTokenExpiresAt(connection, tokens);

  // Check if token is still valid
  if (tokens.expires_in && tokens.access_token) {
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
      throw e;
    }
  }

  if (Number.isFinite(expiresAt) && now >= expiresAt) {
    throw publishingError(
      "Reddit access token expired. Reconnect Reddit before retrying.",
      "auth",
      401
    );
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
    throw publishingError(
      "Reddit token refresh failed. Reconnect Reddit if the credential expired.",
      [400, 401, 403].includes(response.status)
        ? "auth"
        : response.status === 429
          ? "rate_limit"
          : "transient",
      response.status
    );
  }

  const tokens = await response.json();
  if (!tokens.access_token)
    throw publishingError(
      "Reddit did not return a usable refreshed access token. Reconnect Reddit.",
      "auth"
    );

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
async function uploadRedditMedia(uid, contentUrl, mimeType, suppliedMedia = {}) {
  if (!contentUrl && !suppliedMedia.buffer) return null;
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("No valid Reddit access token for upload");

  // 1. Fetch content stream/buffer
  const filename =
    suppliedMedia.filename ||
    decodeURIComponent(contentUrl.split("/").pop().split("?")[0]).split("/").pop() ||
    "media_file";
  // Determine mimeType if not provided? For now assume caller provides or we default
  // Ideally we inspect file, but simple default is okay:
  if (!mimeType) {
    if (filename.endsWith(".mp4")) mimeType = "video/mp4";
    else if (filename.endsWith(".mov")) mimeType = "video/quicktime";
    else mimeType = "video/mp4";
  }

  let buffer = suppliedMedia.buffer;
  if (!buffer) {
    const contentRes = await safeFetch(contentUrl, fetchFn);
    if (!contentRes.ok) throw new Error("Failed to fetch Reddit upload source");
    buffer =
      typeof contentRes.buffer === "function"
        ? await contentRes.buffer()
        : Buffer.from(await contentRes.arrayBuffer());
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
    throw publishingError(
      `Reddit Lease failed: ${err}`,
      [401, 403].includes(leaseRes.status)
        ? "auth"
        : leaseRes.status === 429
          ? "rate_limit"
          : "transient",
      leaseRes.status
    );
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
    sourceBuffer: buffer,
  };
}

async function getContentPosterUrl(contentId) {
  if (!contentId) return null;
  try {
    const snap = await db.collection("content").doc(contentId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return (
      data.thumbnailUrl ||
      data.thumbnail_url ||
      data.posterUrl ||
      data.coverImage ||
      data.imageUrl ||
      data.image_url ||
      null
    );
  } catch (_) {
    return null;
  }
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
  submissionReceipt,
  onSubmissionAccepted,
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

  const pendingResult = receipt => ({
    success: false,
    pending: true,
    platform: "reddit",
    subreddit,
    errorClass: "publication_pending",
    error:
      "Reddit accepted the submission; publication is still being verified. The video will not be submitted again.",
    submissionReceipt: receipt,
  });
  const confirm = async receipt => {
    let identity = receipt.postId
      ? { postId: receipt.postId, url: receipt.url }
      : (await waitForRedditPublication(receipt.websocketUrl)) ||
        (await findRedditPublication({ receipt, accessToken, fetchFn }));
    if (!identity) return pendingResult(receipt);
    const identifiedReceipt = { ...receipt, ...identity };
    if (onSubmissionAccepted) await onSubmissionAccepted(identifiedReceipt);
    if (kind === "video") {
      const video = await verifyRedditVideoPublication({ identity, accessToken, fetchFn });
      if (!video) return pendingResult(identifiedReceipt);
      identity = { ...identity, ...video };
    }
    return storeConfirmedPost(identity, {
      json: { data: { id: identity.postId, url: identity.url } },
    });
  };
  const storeConfirmedPost = async (identity, raw) => {
    if (contentId) {
      try {
        await db
          .collection("content")
          .doc(contentId)
          .set(
            {
              reddit: {
                postId: identity.postId,
                subreddit,
                title,
                kind,
                url: identity.url,
                postedAt: new Date().toISOString(),
                lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
              },
            },
            { merge: true }
          );
      } catch (e) {
        console.warn("[Reddit] Failed to store confirmed post:", e.message);
      }
    }
    if (videoUrl) cleanupSourceFile(videoUrl).catch(() => {});
    return { success: true, platform: "reddit", ...identity, subreddit, raw };
  };
  if (submissionReceipt) {
    if (
      submissionReceipt.subreddit !== subreddit ||
      submissionReceipt.title !== title.substring(0, 300) ||
      submissionReceipt.kind !== kind
    ) {
      throw publishingError(
        "Reddit submission receipt does not match this post. Review the existing submission before retrying.",
        "publication_unconfirmed"
      );
    }
    return confirm(submissionReceipt);
  }

  // Handle Video Upload (Native)
  let finalVideoUrl = null;
  let finalPosterUrl = null;
  let sourceBuffer;

  if (kind === "video") {
    // 1. Upload Video
    const vSource = videoUrl || url;
    try {
      // console.log("Uploading video to standard Reddit S3...");
      // Reddit media upload is just the first step.
      // We do NOT cleanup here. We cleanup after successful *submission*.
      const vResult = await uploadRedditMedia(uid, vSource, "video/mp4");
      finalVideoUrl = vResult.url;
      sourceBuffer = vResult.sourceBuffer;
    } catch (e) {
      if (e.errorClass) throw e;
      throw new Error(`Failed to upload video to Reddit: ${e.message}`);
    }

    // 2. Upload Thumbnail (required by Reddit video submit API)
    let posterSource = thumbnailUrl;
    if (!posterSource) {
      posterSource = await getContentPosterUrl(contentId);
    }

    if (posterSource) {
      try {
        const tResult = await uploadRedditMedia(uid, posterSource, "image/png");
        finalPosterUrl = tResult.url;
      } catch (e) {
        if (e.errorClass === "auth") throw e;
        console.warn("[Reddit] Failed to upload thumbnail:", e.message);
      }
    } else {
      const buffer = await createRedditVideoPoster(sourceBuffer);
      const poster = await uploadRedditMedia(uid, null, "image/png", {
        buffer,
        filename: "video-poster.png",
      });
      finalPosterUrl = poster.url;
    }

    // Hard fail early with actionable message instead of opaque Reddit API error.
    if (!finalPosterUrl) {
      throw new Error(
        "Reddit video submission requires a valid poster image (video_poster_url). Thumbnail upload failed."
      );
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
  const submittedAt = new Date().toISOString();
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
    throw publishingError(
      `Reddit posting failed: ${errorMsg}`,
      [401, 403].includes(response.status)
        ? "auth"
        : response.status === 429
          ? "rate_limit"
          : response.status >= 500
            ? "transient"
            : "validation",
      response.status
    );
  }

  if (responseData.json && responseData.json.errors && responseData.json.errors.length > 0) {
    const errs = responseData.json.errors.map(e => e[1]).join(", ");
    console.error(
      "[Reddit] Submit API errors:",
      JSON.stringify({
        errors: responseData.json.errors,
        kind,
        subreddit,
        hasVideo: !!finalVideoUrl,
        hasPoster: !!finalPosterUrl,
      })
    );
    const codes = responseData.json.errors.map(e => e[0]);
    throw publishingError(
      `Reddit API Error: ${errs}`,
      codes.includes("RATELIMIT") ? "rate_limit" : "validation"
    );
  }

  // Reddit returns data in json.data.url format
  const postData = responseData.json?.data;
  const postId = postData?.id || postData?.name;
  const postUrl = postData?.url;
  const identity = redditPostIdentity(postData?.permalink || postUrl);
  if (postId && identity && kind !== "video")
    return storeConfirmedPost({ ...identity, postId }, responseData);
  const receipt = {
    submittedAt,
    subreddit,
    title: title.substring(0, 300),
    kind,
    websocketUrl: typeof postData?.websocket_url === "string" ? postData.websocket_url : null,
    mediaUrl: finalVideoUrl || url || null,
    text: kind === "self" ? text : null,
    ...(identity ? { postId: identity.postId, url: identity.url } : {}),
  };
  // Persist acknowledgement before any fallible provider verification.
  if (onSubmissionAccepted) await onSubmissionAccepted(receipt);
  if (!postData || !Array.isArray(responseData.json?.errors)) {
    throw publishingError(
      "Reddit returned no verifiable submission receipt. Check the profile before retrying to avoid a duplicate.",
      "publication_unconfirmed"
    );
  }
  return confirm(receipt);
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

async function getOwnProfile({ uid }) {
  if (!uid) throw new Error("uid required");
  const accessToken = await getValidAccessToken(uid);
  if (!accessToken) throw new Error("Reddit connection unavailable");
  const response = await safeFetch("https://oauth.reddit.com/api/v1/me", fetchFn, {
    fetchOptions: {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "AutoPromote/1.0" },
      signal: AbortSignal.timeout(15000),
    },
    requireHttps: true,
    allowHosts: ["oauth.reddit.com"],
  });
  if (!response.ok) throw new Error("Reddit profile unavailable; reconnect the account");
  const data = await response.json();
  if (typeof data.name !== "string" || !/^[a-z0-9_-]{3,20}$/i.test(data.name))
    throw new Error("Reddit returned an invalid profile identity");
  return { connected: true, name: data.name };
}

module.exports = {
  getUserRedditConnection,
  getValidAccessToken,
  refreshToken,
  postToReddit,
  getPostInfo,
  getSubredditInfo,
  getOwnProfile,
};
