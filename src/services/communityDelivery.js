const crypto = require("crypto");
const { db } = require("../firebaseAdmin");
const authority = require("./communityPublishing");
const { publishingError } = require("./publishingTaskErrors");
const { safeFetch } = require("../utils/ssrfGuard");

const fail = (message, kind = "validation") => publishingError(message, kind);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
async function ownedMedia(uid, contentId, p) {
  if (!contentId) {
    if (p.videoUrl || p.imageUrl || p.media_url || p.url)
      throw fail("Select owned media before publishing.");
    return null;
  }
  const snap = await db.collection("content").doc(contentId).get();
  const c = snap.exists && snap.data();
  if (!c || (c.user_id || c.userId || c.uid) !== uid)
    throw fail("This content is not owned by your account.", "auth");
  require("./contentMediaDependency").assertAvailable(c);
  const urls = [
    c.persistentMediaUrl,
    c.url,
    c.mediaUrl,
    c.media_url,
    c.downloadInfo?.url,
    c.processedUrl,
  ].filter(Boolean);
  const url = p.media_url || p.videoUrl || p.imageUrl || p.url || urls[0];
  if (!url) return null;
  // Separate workers can refresh the same approved object's signed URL at
  // different instants. Its bucket/path/generation remains the identity.
  let pinnedTeamMedia = false;
  if (c.teamReleaseId && c.source?.generation) {
    try {
      const parsed = new URL(url);
      pinnedTeamMedia =
        parsed.protocol === "https:" &&
        !parsed.username &&
        !parsed.password &&
        parsed.hostname === "storage.googleapis.com" &&
        decodeURIComponent(parsed.pathname) === `/${c.source.bucketName}/${c.source.storagePath}` &&
        parsed.searchParams.get("generation") === String(c.source.generation);
    } catch (_) {
      /* Fall through to the ordinary owned-URL check. */
    }
  }
  if (!urls.includes(url) && !pinnedTeamMedia) throw fail("Use the selected owned media.", "auth");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw fail("Media needs a secure publishing URL.");
  const type = String(p.mediaType || c.type || c.mediaType || "");
  return {
    url,
    type: type.startsWith("image") ? "image" : type.startsWith("video") ? "video" : null,
  };
}
async function attachment(media) {
  if (!media.type) throw fail("Choose an image or video for Discord.");
  const response = await safeFetch(media.url, fetch, {
    requireHttps: true,
    allowHosts: ["firebasestorage.googleapis.com", "storage.googleapis.com"],
    fetchOptions: { redirect: "error", signal: AbortSignal.timeout(60000) },
  });
  if (!response.ok) throw fail("The selected media could not be downloaded.", "transient");
  if (Number(response.headers.get("content-length")) > MAX_ATTACHMENT_BYTES) {
    await response.body?.cancel?.();
    throw fail(
      "Discord native uploads are limited to 10 MiB here. Choose Share link for larger media."
    );
  }
  const mime = String(response.headers.get("content-type") || "").split(";")[0];
  if (
    !(media.type === "video"
      ? mime === "video/mp4"
      : ["image/png", "image/jpeg", "image/webp"].includes(mime))
  )
    throw fail("Discord requires MP4 video or PNG, JPEG or WebP images.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > MAX_ATTACHMENT_BYTES) throw fail("Discord media exceeds the 10 MiB upload limit.");
    chunks.push(Buffer.from(chunk));
  }
  if (!bytes) throw fail("The selected media is empty.");
  return {
    bytes: Buffer.concat(chunks),
    mime,
    name:
      media.type === "video"
        ? "video.mp4"
        : mime === "image/png"
          ? "image.png"
          : mime === "image/webp"
            ? "image.webp"
            : "image.jpg",
  };
}
function multipart(body, file) {
  const boundary = `autopromote-${crypto.randomBytes(18).toString("hex")}`;
  return {
    headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(body)}\r\n`
      ),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="files[0]"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n`
      ),
      file.bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}
async function deliver({
  platform,
  uid,
  contentId,
  payload = {},
  submissionReceipt,
  onSubmissionAccepted,
}) {
  // Destination IDs are owner-scoped; caller-supplied webhooks and bot channels are never used.
  const p = { ...payload, ...(payload.platformOptions?.[platform] || {}) };
  const d = await authority.resolveDestination(uid, platform, p);
  const media = await ownedMedia(uid, contentId, p);
  const text = String(p.message ?? p.text ?? p.content ?? p.description ?? p.title ?? "").trim();
  const mode = p.deliveryMode === "link" ? "link" : "native";
  const binding = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        platform,
        uid,
        contentId: contentId || null,
        destination: d.id,
        media,
        text,
        mode,
      })
    )
    .digest("hex");
  if (submissionReceipt) {
    if (submissionReceipt.binding !== binding || submissionReceipt.platform !== platform)
      throw fail(
        "Stored publication differs from this request. Review before retrying.",
        "publication_unconfirmed"
      );
    if (submissionReceipt.messageId) return submissionReceipt.result;
    throw fail(
      "The provider may have accepted this post. Review the destination before retrying; no automatic resend.",
      "publication_unconfirmed"
    );
  }
  let url, options;
  if (platform === "telegram") {
    if (!text && !media) throw fail("Add a message or media.");
    const body = { chat_id: d.targetId };
    let method = "sendMessage";
    if (media) {
      if (!media.type) throw fail("Choose an image or video for Telegram.");
      if (text.length > 1024) throw fail("Keep Telegram media captions within 1024 characters.");
      method = media.type === "video" ? "sendVideo" : "sendPhoto";
      body[media.type === "video" ? "video" : "photo"] = media.url;
      if (text) body.caption = text;
    } else {
      if (text.length > 4096) throw fail("Keep Telegram messages within 4096 characters.");
      body.text = text;
    }
    url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;
    options = { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  } else {
    let file = null;
    let content = text;
    if (media && mode === "link") content = [content, media.url].filter(Boolean).join("\n");
    else if (media) file = await attachment(media);
    if (!content && !file) throw fail("Add a message or media.");
    if (content.length > 2000)
      throw fail("Keep Discord messages within 2000 characters, including the shared link.");
    // Do not permit user copy to trigger @everyone or role notifications.
    const body = { content, allowed_mentions: { parse: [] } };
    if (file) body.attachments = [{ id: 0, filename: file.name }];
    url = `${authority.webhookUrl(d)}?wait=true`;
    options = file
      ? multipart(body, file)
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }
  const intent = {
    platform,
    binding,
    destinationId: d.id,
    targetId: d.targetId,
    submittedAt: new Date().toISOString(),
  };
  // Persist before the outbound call. A crash/timeout cannot silently trigger another post.
  if (onSubmissionAccepted) await onSubmissionAccepted(intent);
  let response, data;
  try {
    response = await fetch(url, {
      method: "POST",
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(90000),
    });
    data = await response.json().catch(() => null);
  } catch (_) {
    throw fail(
      "Delivery outcome is unknown. Review the destination before retrying.",
      "publication_unconfirmed"
    );
  }
  if (!response.ok || (platform === "telegram" && data?.ok !== true)) {
    // Only explicit rejection with no possible acceptance releases the send intent.
    const status = data?.error_code || response.status;
    if (status >= 400 && status < 500) {
      if (onSubmissionAccepted) await onSubmissionAccepted(null);
      throw publishingError(
        status === 429
          ? "Provider rate limit reached."
          : "Provider rejected the post. Check media and destination permissions.",
        status === 429 ? "rate_limit" : status === 401 || status === 403 ? "auth" : "validation",
        status
      );
    }
    throw fail(
      "Delivery could not be confirmed. Review the destination before retrying.",
      "publication_unconfirmed"
    );
  }
  const message = platform === "telegram" ? data.result : data;
  const messageId = platform === "telegram" ? message?.message_id : message?.id;
  const target = platform === "telegram" ? message?.chat?.id : message?.channel_id;
  if (
    !messageId ||
    String(target) !== d.targetId ||
    (media &&
      mode === "native" &&
      (platform === "telegram" ? !message.video && !message.photo : !message.attachments?.length))
  )
    throw fail(
      "The provider response did not confirm the selected media and destination.",
      "publication_unconfirmed"
    );
  const result = {
    success: true,
    platform,
    postId: String(messageId),
    messageId: String(messageId),
    externalId: String(messageId),
    channelId: d.targetId,
    chatId: d.targetId,
    deliveryMode: mode,
    destinationId: d.id,
    url:
      platform === "discord"
        ? `https://discord.com/channels/${d.guildId}/${d.targetId}/${messageId}`
        : null,
  };
  if (onSubmissionAccepted)
    await onSubmissionAccepted({ ...intent, messageId: String(messageId), result });
  return result;
}
module.exports = { deliver, ownedMedia, MAX_ATTACHMENT_BYTES };
