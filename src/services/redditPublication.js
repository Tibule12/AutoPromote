const { safeFetch, validateUrl } = require("../utils/ssrfGuard");
const { publishingError } = require("./publishingTaskErrors");

function redditPostIdentity(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value, "https://www.reddit.com");
    if (
      url.protocol !== "https:" ||
      !["reddit.com", "www.reddit.com"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      return null;
    const match = url.pathname.match(/^\/(?:r|user)\/[^/]+\/comments\/([a-z0-9]+)(?:\/|$)/i);
    return match ? { postId: match[1], url: `https://www.reddit.com${url.pathname}` } : null;
  } catch (_) {
    return null;
  }
}

async function waitForRedditPublication(websocketUrl, timeoutMs = 10000) {
  if (!websocketUrl) return null;
  let url;
  try {
    url = new URL(websocketUrl);
  } catch (_) {
    return null;
  }
  if (url.protocol !== "wss:" || url.username || url.password || (url.port && url.port !== "443"))
    return null;
  const validation = await validateUrl(websocketUrl.replace(/^wss:/, "https:"), {
    requireHttps: true,
    allowHosts: ["redditmedia.com"],
  });
  if (!validation.ok) return null;
  const WebSocket = global.WebSocket || require("undici").WebSocket;
  return new Promise((resolve, reject) => {
    let socket;
    let done = false;
    const finish = (result, error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch (_) {}
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      socket = new WebSocket(websocketUrl);
      socket.addEventListener("message", event => {
        let update;
        try {
          update = JSON.parse(String(event.data));
        } catch (_) {
          return;
        }
        if (update.type === "failed") {
          finish(
            null,
            publishingError(
              "Reddit could not process the submitted media. Check the video before retrying.",
              "validation"
            )
          );
          return;
        }
        const identity = redditPostIdentity(update.payload?.redirect);
        if (identity) finish(identity);
      });
      socket.addEventListener("error", () => finish(null));
      socket.addEventListener("close", () => finish(null));
    } catch (_) {
      finish(null);
    }
  });
}

// Read the authenticated author's submissions. A receipt never authorizes
// another submit request: retries only look for the already accepted post.
async function findRedditPublication({ receipt, accessToken, fetchFn }) {
  const options = {
    fetchOptions: {
      headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "AutoPromote/1.0" },
      signal: AbortSignal.timeout(15000),
    },
    requireHttps: true,
    allowHosts: ["oauth.reddit.com"],
  };
  const checkResponse = (response, stage) => {
    if (!response.ok)
      throw publishingError(
        `Reddit ${stage} lookup failed.`,
        [401, 403].includes(response.status)
          ? "auth"
          : response.status === 429
            ? "rate_limit"
            : "transient",
        response.status
      );
  };
  const profile = await safeFetch("https://oauth.reddit.com/api/v1/me", fetchFn, options);
  checkResponse(profile, "account");
  const { name } = await profile.json();
  if (typeof name !== "string" || !/^[a-z0-9_-]{3,20}$/i.test(name))
    throw publishingError("Reddit profile identity is unavailable. Reconnect Reddit.", "auth");
  const listingUrl =
    receipt.subreddit.toLowerCase() === `u_${name}`.toLowerCase()
      ? `https://oauth.reddit.com/r/${encodeURIComponent(receipt.subreddit)}/new?limit=100&raw_json=1`
      : `https://oauth.reddit.com/user/${encodeURIComponent(name)}/submitted?sort=new&limit=100&raw_json=1`;
  const response = await safeFetch(listingUrl, fetchFn, options);
  checkResponse(response, "publication");
  const data = await response.json();
  const submittedAt = Date.parse(receipt.submittedAt);
  const matches = (data.data?.children || [])
    .map(child => child.data)
    .filter(post => {
      const createdAt = Number(post?.created_utc) * 1000;
      return (
        post?.author?.toLowerCase() === name.toLowerCase() &&
        post.subreddit?.toLowerCase() === receipt.subreddit.toLowerCase() &&
        post.title === receipt.title &&
        Number.isFinite(submittedAt) &&
        createdAt >= submittedAt - 10000 &&
        createdAt <= submittedAt + 10 * 60 * 1000 &&
        (receipt.kind !== "video" || post.is_video === true) &&
        (receipt.kind !== "link" || post.url === receipt.mediaUrl) &&
        (receipt.kind !== "self" || post.selftext === receipt.text)
      );
    });
  if (matches.length !== 1) return null;
  return redditPostIdentity(matches[0].permalink);
}

async function verifyRedditVideoPublication({ identity, accessToken, fetchFn }) {
  const id = String(identity.postId || "").replace(/^t3_/, "");
  if (!/^[a-z0-9]+$/i.test(id)) return null;
  const response = await safeFetch(
    `https://oauth.reddit.com/api/info?id=t3_${id}&raw_json=1`,
    fetchFn,
    {
      fetchOptions: {
        headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "AutoPromote/1.0" },
        signal: AbortSignal.timeout(15000),
      },
      requireHttps: true,
      allowHosts: ["oauth.reddit.com"],
    }
  );
  if (!response.ok)
    throw publishingError(
      "Reddit video verification failed.",
      [401, 403].includes(response.status) ? "auth" : "transient",
      response.status
    );
  const data = await response.json();
  const post = data.data?.children?.find(child => child.data?.id === id)?.data;
  const video = post?.secure_media?.reddit_video || post?.media?.reddit_video;
  // is_video can be true while both media fields are null and the UI shows
  // only a v.redd.it link. Require a completed attachment and real video bytes.
  if (
    !post?.is_video ||
    !video ||
    video.transcoding_status !== "completed" ||
    !(Number(video.duration) > 0) ||
    !video.fallback_url
  )
    return null;
  const media = await safeFetch(video.fallback_url, fetchFn, {
    fetchOptions: { headers: { Range: "bytes=0-31" }, signal: AbortSignal.timeout(15000) },
    requireHttps: true,
    allowHosts: ["v.redd.it"],
  });
  if (!media.ok) return null;
  const bytes =
    typeof media.buffer === "function"
      ? await media.buffer()
      : Buffer.from(await media.arrayBuffer());
  if (bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp") return null;
  return {
    videoVerified: true,
    videoUrl: video.fallback_url,
    videoDuration: Number(video.duration),
    hasAudio: !!video.has_audio,
    publicationConfirmed: true,
  };
}

module.exports = {
  redditPostIdentity,
  waitForRedditPublication,
  findRedditPublication,
  verifyRedditVideoPublication,
};
