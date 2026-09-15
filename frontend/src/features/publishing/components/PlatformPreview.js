import React from "react";
import { SafeImage, SafeVideo } from "../../../components/SafeMedia";

import { revokeObjectUrlLater } from "../../../utils/objectUrl";
import { sanitizeUrl } from "../../../utils/security";
import { playMediaSafely } from "../../../utils/mediaPlayback";
import { getBrowserPreviewFailureMessage, buildTikTokCaption } from "../utils/publishingUtils";


export const PlatformPreview = ({
  label,
  data,
  globalFile,
  previewUrl,
  thumbnailUrl,
  mediaType,
  platformId,
  creatorInfo,
}) => {
  // Sanitize: strict URL normalization and protocol allowlist to prevent DOM sink taint
  const normalizeSafeHttpUrl = React.useCallback(raw => {
    if (typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      const parsed = new URL(trimmed, window.location.origin);
      const protocol = parsed.protocol.toLowerCase();
      if (protocol !== "https:" && protocol !== "http:") return undefined;
      return parsed.href;
    } catch {
      return undefined;
    }
  }, []);

  const safeThumbUrl = React.useMemo(
    () => normalizeSafeHttpUrl(thumbnailUrl),
    [thumbnailUrl, normalizeSafeHttpUrl]
  );
  // Correctly resolve the file to preview: Platform specific > Global
  const fileToPreview = data.file || globalFile;

  const localPreviewObjectUrlRef = React.useRef(null);
  const [effectivePreviewUrl, setEffectivePreviewUrl] = React.useState(null);

  React.useEffect(() => {
    if (localPreviewObjectUrlRef.current) {
      revokeObjectUrlLater(localPreviewObjectUrlRef.current);
      localPreviewObjectUrlRef.current = null;
    }

    if (!fileToPreview) {
      setEffectivePreviewUrl(null);
      return undefined;
    }

    if (fileToPreview === globalFile && previewUrl) {
      setEffectivePreviewUrl(previewUrl);
      return undefined;
    }

    if (fileToPreview instanceof File || fileToPreview instanceof Blob) {
      const objectUrl = URL.createObjectURL(fileToPreview);
      localPreviewObjectUrlRef.current = objectUrl;
      setEffectivePreviewUrl(objectUrl);
      return () => {
        revokeObjectUrlLater(objectUrl);
        if (localPreviewObjectUrlRef.current === objectUrl) {
          localPreviewObjectUrlRef.current = null;
        }
      };
    }

    if (typeof fileToPreview === "string") {
      setEffectivePreviewUrl(fileToPreview);
      return undefined;
    }

    setEffectivePreviewUrl(null);
    return undefined;
  }, [fileToPreview, globalFile, previewUrl]);

  // RENDER HELPERS
  const [previewError, setPreviewError] = React.useState(null);
  const [mediaAspectRatio, setMediaAspectRatio] = React.useState(null);
  const [overlayPlaybackRequested, setOverlayPlaybackRequested] = React.useState(false);

  React.useEffect(() => {
    // Clear preview error when the preview source changes.
    setPreviewError(null);
    setMediaAspectRatio(null);
    setOverlayPlaybackRequested(false);
  }, [effectivePreviewUrl, thumbnailUrl]);

  const renderMedia = (style = {}) => {
    if (previewError) {
      return (
        <div
          style={{
            ...style,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#333",
            color: "#f88",
            minHeight: "200px",
            padding: "10px",
            textAlign: "center",
          }}
        >
          <div>
            <strong>Preview not available</strong>
            <div style={{ fontSize: "0.9rem", marginTop: "6px" }}>{previewError}</div>
          </div>
        </div>
      );
    }

    if (!effectivePreviewUrl) {
      return (
        <div
          style={{
            ...style,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#333",
            color: "#888",
            minHeight: "200px",
          }}
        >
          No Media
        </div>
      );
    }

    const isVideo =
      mediaType === "video" ||
      (fileToPreview &&
        typeof fileToPreview === "object" &&
        fileToPreview.type?.startsWith("video"));
    const isOverlayFrame = Boolean(style.position);
    const resolvedAspectRatio =
      !isOverlayFrame && mediaAspectRatio ? `${mediaAspectRatio}` : style.aspectRatio;
    const wrapperStyle = {
      ...style,
      overflow: "hidden",
      position: style.position || "relative",
      background: "#000",
      ...(resolvedAspectRatio ? { aspectRatio: resolvedAspectRatio } : {}),
      ...(!isOverlayFrame && resolvedAspectRatio ? { height: "auto" } : {}),
    };
    const mediaStyle = {
      width: "100%",
      height: "100%",
      objectFit: "contain",
      background: "#000",
      display: "block",
    };

    if (isVideo) {
      // Check if controls should be hidden (for overlay styles)
      // If absolute-positioned, we assume overlays exist and hide controls.
      // But we allow click-to-play/pause logic via ref if needed.
      const showControls = !style.position;
      const showPosterOnly = isOverlayFrame && safeThumbUrl && !overlayPlaybackRequested;

      if (showPosterOnly) {
        return (
          <div style={wrapperStyle}>
            <img
              src={sanitizeUrl(safeThumbUrl)}
              alt="Selected cover preview"
              style={mediaStyle}
              onLoad={event => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth && naturalHeight) {
                  setMediaAspectRatio(naturalWidth / naturalHeight);
                }
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 10,
                top: 10,
                background: "rgba(2,6,23,0.76)",
                border: "1px solid rgba(148,163,184,0.4)",
                color: "#e2e8f0",
                borderRadius: 999,
                padding: "5px 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.02em",
                pointerEvents: "none",
              }}
            >
              Cover selected
            </div>
            <button
              type="button"
              onClick={() => setOverlayPlaybackRequested(true)}
              style={{
                position: "absolute",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(15,23,42,0.82)",
                color: "#fff",
                borderRadius: 999,
                padding: "12px 18px",
                fontSize: "0.92rem",
                fontWeight: 700,
                cursor: "pointer",
                boxShadow: "0 12px 32px rgba(0,0,0,0.35)",
              }}
            >
              Play Preview
            </button>
          </div>
        );
      }

      return (
        <div style={wrapperStyle}>
          <SafeVideo
            key={effectivePreviewUrl} // Force reload on URL change
            src={sanitizeUrl(effectivePreviewUrl)}
            poster={safeThumbUrl || undefined}
            controls={showControls}
            playsInline
            loop
            preload={showControls || overlayPlaybackRequested ? "metadata" : "none"}
            autoPlay={!showControls ? overlayPlaybackRequested : !thumbnailUrl}
            muted // Start muted for autoplay policy
            style={mediaStyle}
            onLoadedMetadata={event => {
              const { videoWidth, videoHeight } = event.currentTarget;
              if (videoWidth && videoHeight) {
                setMediaAspectRatio(videoWidth / videoHeight);
              }
            }}
            onError={e => {
              const message = getBrowserPreviewFailureMessage(fileToPreview, e.currentTarget);
              console.warn("Preview video failed to load", {
                fileName: fileToPreview?.name,
                fileType: fileToPreview?.type,
                fileSize: fileToPreview?.size,
                mediaErrorCode: e.currentTarget?.error?.code,
                canPlayType:
                  fileToPreview?.type && typeof document !== "undefined"
                    ? document.createElement("video").canPlayType(fileToPreview.type)
                    : "",
              });
              setPreviewError(message);
            }}
            onClick={e => {
              // Simple toggle play/pause for non-controlled mockups.
              if (!showControls) {
                if (e.target.paused) {
                  void playMediaSafely(e.target, {
                    onUnexpectedError: error => console.warn("Preview playback failed", error),
                  });
                } else e.target.pause();
              }
            }}
          />
          {safeThumbUrl && (
            <div
              style={{
                position: "absolute",
                left: 10,
                top: 10,
                background: "rgba(2,6,23,0.76)",
                border: "1px solid rgba(148,163,184,0.4)",
                color: "#e2e8f0",
                borderRadius: 999,
                padding: "5px 10px",
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.02em",
                pointerEvents: "none",
              }}
            >
              Cover selected
            </div>
          )}
          {!showControls && (
            <div
              style={{
                position: "absolute",
                top: "10px",
                right: "10px",
                background: "rgba(2,6,23,0.7)",
                padding: "6px 10px",
                borderRadius: "999px",
                pointerEvents: "none",
                color: "#e2e8f0",
                fontSize: "0.72rem",
                fontWeight: 700,
              }}
            >
              Tap video to pause/play
            </div>
          )}
        </div>
      );
    }
    return (
      <div style={wrapperStyle}>
        <SafeImage
          src={sanitizeUrl(effectivePreviewUrl)}
          alt="Preview"
          style={mediaStyle}
          onLoad={event => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth && naturalHeight) {
              setMediaAspectRatio(naturalWidth / naturalHeight);
            }
          }}
        />
      </div>
    );
  };

  // --- PLATFORM SPECIFIC MOCKUPS ---

  // 1. TikTok Mockup
  if (platformId === "tiktok") {
    const previewCaption = buildTikTokCaption({
      title: data.title,
      description: data.description,
      caption: data.caption,
    });
    return (
      <div
        className="platform-preview-mockup tiktok-mockup"
        style={{
          width: "100%",
          maxWidth: "300px",
          margin: "0 auto",
          background: "#000",
          borderRadius: "12px",
          overflow: "hidden",
          position: "relative",
          aspectRatio: "9 / 16",
          border: "1px solid #333",
        }}
      >
        {/* Media Filling Container */}
        {renderMedia({ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 })}

        {/* Overlay UI */}
        <div
          style={{
            position: "absolute",
            bottom: "0",
            left: "0",
            right: "0",
            padding: "15px",
            background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
            color: "white",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
            {creatorInfo?.display_name ||
              creatorInfo?.user?.display_name ||
              creatorInfo?.open_id ||
              "@your_username"}
          </div>
          {data.title ? (
            <div style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "4px" }}>
              {data.title}
            </div>
          ) : null}
          <div style={{ fontSize: "0.9rem", marginBottom: "10px", lineHeight: "1.25" }}>
            {previewCaption || "Your title and description will appear here..."}
          </div>
          <div style={{ display: "flex", alignItems: "center", fontSize: "0.8rem" }}>
            <span>🎵</span>{" "}
            <span
              className="sound-label"
              style={{
                marginLeft: "5px",
                width: "150px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Original Sound - @your_username
            </span>
          </div>
        </div>

        {/* Right Side Icons */}
        <div
          style={{
            position: "absolute",
            bottom: "80px",
            right: "10px",
            display: "flex",
            flexDirection: "column",
            gap: "15px",
            alignItems: "center",
          }}
        >
          <div
            style={{ width: "40px", height: "40px", background: "#fff", borderRadius: "50%" }}
          ></div>{" "}
          {/* Avatar */}
          <div style={{ textAlign: "center", color: "white" }}>
            ❤️
            <br />
            <span style={{ fontSize: "10px" }}>Like</span>
          </div>
          <div style={{ textAlign: "center", color: "white" }}>
            💬
            <br />
            <span style={{ fontSize: "10px" }}>123</span>
          </div>
          <div style={{ textAlign: "center", color: "white" }}>
            ↪️
            <br />
            <span style={{ fontSize: "10px" }}>Share</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. YouTube Mockup
  if (platformId === "youtube") {
    const isShorts = data.shortsMode;
    const shortDescription = data.description
      ? data.description.length > 90
        ? `${data.description.substring(0, 90)}...`
        : data.description
      : "";
    if (isShorts) {
      // YouTube Shorts (flexible for horizontal videos)
      const isHorizontal = mediaAspectRatio && mediaAspectRatio > 1.2;
      return (
        <div
          className="platform-preview-mockup youtube-shorts-mockup"
          style={{
            width: isHorizontal ? "460px" : "300px",
            margin: "0 auto",
            background: "#000",
            borderRadius: "12px",
            overflow: "hidden",
            position: "relative",
            height: isHorizontal ? "340px" : "530px",
            border: "1px solid #333",
          }}
        >
          {renderMedia({ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 })}
          <div
            style={{
              position: "absolute",
              bottom: "0",
              left: "0",
              right: "0",
              padding: "15px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
              color: "white",
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: "5px" }}>
              {data.title || "Title goes here..."}
            </div>
            {shortDescription ? (
              <div
                style={{
                  fontSize: "0.8rem",
                  lineHeight: "1.35",
                  marginBottom: "8px",
                  opacity: 0.92,
                  whiteSpace: "pre-wrap",
                }}
              >
                {shortDescription}
              </div>
            ) : null}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {creatorInfo?.snippet?.thumbnails?.default?.url ? (
                <img
                  src={creatorInfo.snippet.thumbnails.default.url}
                  alt="Avatar"
                  style={{
                    width: "24px",
                    height: "24px",
                    borderRadius: "50%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "24px",
                    height: "24px",
                    background: "#ccc",
                    borderRadius: "50%",
                  }}
                ></div>
              )}
              <span style={{ fontSize: "0.9rem" }}>
                {creatorInfo?.snippet?.title || "@channel"}
              </span>
              <button
                style={{
                  background: "#fff",
                  color: "#000",
                  border: "none",
                  borderRadius: "12px",
                  padding: "2px 10px",
                  fontSize: "10px",
                  fontWeight: "bold",
                }}
              >
                Subscribe
              </button>
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: "100px",
              right: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              alignItems: "center",
              color: "white",
            }}
          >
            <div style={{ textAlign: "center" }}>
              👍 <span style={{ fontSize: "10px" }}>Like</span>
            </div>
            <div style={{ textAlign: "center" }}>
              👎 <span style={{ fontSize: "10px" }}>Dislike</span>
            </div>
            <div style={{ textAlign: "center" }}>
              💬 <span style={{ fontSize: "10px" }}>Cost</span>
            </div>
          </div>
        </div>
      );
    }
    // Standard YouTube
    return (
      <div
        className="platform-preview-mockup youtube-mockup"
        style={{
          width: "100%",
          maxWidth: "350px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "0px",
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      >
        {renderMedia({ width: "100%", height: "auto", aspectRatio: "16/9" })}
        <div style={{ padding: "12px" }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: "1rem", lineHeight: "1.2", color: "#000" }}>
            {data.title || "Video Title Placeholder"}
          </h4>
          <div
            style={{ display: "flex", fontSize: "0.8rem", color: "#606060", marginBottom: "10px" }}
          >
            <span>1M views • 1 hour ago</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              borderTop: "1px solid #eee",
              borderBottom: "1px solid #eee",
              padding: "8px 0",
            }}
          >
            {creatorInfo?.snippet?.thumbnails?.default?.url ? (
              <img
                src={creatorInfo.snippet.thumbnails.default.url}
                alt="Avatar"
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
            ) : (
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  background: "#ccc",
                  borderRadius: "50%",
                }}
              ></div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#000" }}>
                {creatorInfo?.snippet?.title || "Channel Name"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#606060" }}>
                {creatorInfo?.statistics?.subscriberCount
                  ? `${new Intl.NumberFormat("en-US", { notation: "compact" }).format(
                      creatorInfo.statistics.subscriberCount
                    )} subscribers`
                  : "10K subscribers"}
              </div>
            </div>
            <button
              style={{
                background: "#000",
                color: "#fff",
                border: "none",
                borderRadius: "18px",
                padding: "6px 12px",
                fontSize: "0.8rem",
                fontWeight: "bold",
              }}
            >
              Subscribe
            </button>
          </div>
          <div
            style={{
              marginTop: "10px",
              fontSize: "0.85rem",
              color: "#000",
              whiteSpace: "pre-wrap",
            }}
          >
            {data.description
              ? data.description.length > 100
                ? data.description.substring(0, 100) + "..."
                : data.description
              : "Video description will appear here..."}
          </div>
        </div>
      </div>
    );
  }

  // 3. Facebook Mockup
  if (platformId === "facebook") {
    return (
      <div
        className="platform-preview-mockup facebook-mockup"
        style={{
          width: "100%",
          maxWidth: "350px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      >
        <div style={{ padding: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{ width: "40px", height: "40px", background: "#1877F2", borderRadius: "50%" }}
          ></div>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#000" }}>
              {data.pageName || "Your Page Name"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#606060" }}>Just now • 🌍</div>
          </div>
        </div>
        <div
          style={{
            padding: "0 12px 12px 12px",
            fontSize: "0.9rem",
            color: "#000",
            whiteSpace: "pre-wrap",
          }}
        >
          {data.message || "Your post message goes here..."}
        </div>
        {renderMedia({ width: "100%", height: "auto", maxHeight: "400px" })}
        <div
          style={{
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid #eee",
            color: "#606060",
            fontSize: "0.9rem",
          }}
        >
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>↪️ Share</span>
        </div>
      </div>
    );
  }

  // 4. Instagram Mockup
  if (platformId === "instagram") {
    const isReel = data.isReel !== false; // Default to true if undefined
    if (isReel) {
      // Instagram Reels stay in a portrait phone frame even when the source is wide.
      return (
        <div
          className="platform-preview-mockup instagram-reel-mockup"
          style={{
            width: "100%",
            maxWidth: "300px",
            margin: "0 auto",
            background: "#000",
            borderRadius: "12px",
            overflow: "hidden",
            position: "relative",
            aspectRatio: "9 / 16",
            border: "1px solid #333",
          }}
        >
          {renderMedia({ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 })}
          <div
            style={{
              position: "absolute",
              bottom: "0",
              left: "0",
              right: "0",
              padding: "15px",
              background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
              color: "white",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <div
                style={{ width: "24px", height: "24px", background: "#ccc", borderRadius: "50%" }}
              ></div>
              <span style={{ fontWeight: "bold", fontSize: "0.9rem" }}>
                {data.username || "username"}
              </span>
              <button
                style={{
                  background: "transparent",
                  border: "1px solid white",
                  color: "white",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "10px",
                }}
              >
                Follow
              </button>
            </div>
            <div style={{ fontSize: "0.9rem", lineHeight: "1.2" }}>
              {data.caption
                ? data.caption.length > 80
                  ? data.caption.substring(0, 80) + "..."
                  : data.caption
                : "Caption..."}
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              bottom: "20px",
              right: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "15px",
              alignItems: "center",
              color: "white",
            }}
          >
            <div style={{ textAlign: "center" }}>♡</div>
            <div style={{ textAlign: "center" }}>💬</div>
            <div style={{ textAlign: "center" }}>✈️</div>
          </div>
        </div>
      );
    }
    // Instagram Post
    return (
      <div
        className="platform-preview-mockup instagram-post-mockup"
        style={{
          width: "100%",
          maxWidth: "350px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "3px",
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      >
        <div style={{ padding: "10px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{
              width: "30px",
              height: "30px",
              background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
              borderRadius: "50%",
            }}
          ></div>
          <div style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#000" }}>
            {data.username || "username"}
          </div>
        </div>
        {renderMedia({ width: "100%", height: "auto" })}
        <div style={{ padding: "10px" }}>
          <div
            style={{
              display: "flex",
              gap: "15px",
              fontSize: "1.2rem",
              marginBottom: "8px",
              color: "#000",
            }}
          >
            <span>♡</span>
            <span>💬</span>
            <span>✈️</span>
          </div>
          <div style={{ fontSize: "0.9rem", color: "#000" }}>
            <span style={{ fontWeight: "bold", marginRight: "5px" }}>
              {data.username || "username"}
            </span>
            {data.caption || "Caption text here..."}
          </div>
        </div>
      </div>
    );
  }

  // 5. LinkedIn Mockup
  if (platformId === "linkedin") {
    const linkedInName =
      creatorInfo?.localizedName ||
      creatorInfo?.meta?.localizedName ||
      [creatorInfo?.localizedFirstName, creatorInfo?.localizedLastName].filter(Boolean).join(" ") ||
      creatorInfo?.meta?.display_name ||
      "Your Company";
    const linkedInFollowers =
      creatorInfo?.meta?.followers ||
      creatorInfo?.followers ||
      creatorInfo?.meta?.followerCount ||
      null;
    return (
      <div
        className="platform-preview-mockup linkedin-mockup"
        style={{
          width: "100%",
          maxWidth: "350px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid #ddd",
        }}
      >
        <div style={{ padding: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
          <div
            style={{ width: "40px", height: "40px", background: "#0A66C2", borderRadius: "4px" }}
          ></div>
          <div>
            <div style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#000" }}>
              {linkedInName}
            </div>
            <div style={{ fontSize: "0.75rem", color: "#606060" }}>
              {linkedInFollowers ? linkedInFollowers.toLocaleString() : "1,234"} followers
            </div>
            <div style={{ fontSize: "0.75rem", color: "#606060" }}>Just now • 🌐</div>
          </div>
        </div>
        <div
          style={{
            padding: "0 12px 12px 12px",
            fontSize: "0.9rem",
            color: "#000",
            whiteSpace: "pre-wrap",
          }}
        >
          {[String(data.title || "").trim(), String(data.commentary || "").trim()]
            .filter(Boolean)
            .join("\n\n") || "Your post content..."}
        </div>
        {renderMedia({ width: "100%", height: "auto", maxHeight: "400px" })}
        <div
          style={{
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            borderTop: "1px solid #eee",
            color: "#606060",
            fontSize: "0.85rem",
          }}
        >
          <span>👍 Like</span>
          <span>💬 Comment</span>
          <span>♻️ Repost</span>
          <span>✈️ Send</span>
        </div>
      </div>
    );
  }

  // 6. Reddit Mockup
  if (platformId === "reddit") {
    const redditPoster =
      creatorInfo?.name || creatorInfo?.meta?.username || creatorInfo?.meta?.name || "me";
    return (
      <div
        className="platform-preview-mockup reddit-mockup"
        style={{
          width: "100%",
          maxWidth: "350px",
          margin: "0 auto",
          background: "#fff",
          borderRadius: "4px",
          overflow: "hidden",
          border: "1px solid #ddd",
          display: "flex",
        }}
      >
        <div
          style={{
            width: "40px",
            background: "#f8f9fa",
            padding: "10px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            color: "#878a8c",
          }}
        >
          <span>⬆️</span>
          <span style={{ fontWeight: "bold", margin: "5px 0" }}>1</span>
          <span>⬇️</span>
        </div>
        <div style={{ flex: 1, padding: "10px" }}>
          <div
            style={{
              fontSize: "0.75rem",
              color: "#787c7e",
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span style={{ fontWeight: "bold", color: "#000" }}>
              r/{data.subreddit || "subreddit"}
            </span>
            <span>• Posted by u/{redditPoster} just now</span>
          </div>
          <h3 style={{ fontSize: "1rem", fontWeight: "500", margin: "0 0 10px 0", color: "#000" }}>
            {data.title || "Your Post Title"}
          </h3>
          <div style={{ borderRadius: "4px", overflow: "hidden", border: "1px solid #eee" }}>
            {renderMedia({ width: "100%", height: "auto", maxHeight: "300px" })}
          </div>
          <div
            style={{
              display: "flex",
              gap: "15px",
              color: "#878a8c",
              fontSize: "0.8rem",
              marginTop: "10px",
              fontWeight: "bold",
            }}
          >
            <span>💬 Comments</span>
            <span>🎁 Award</span>
            <span>↪️ Share</span>
          </div>
        </div>
      </div>
    );
  }

  // Fallback Generic Preview
  return (
    <div
      className="platform-mini-preview"
      style={{
        marginTop: "20px",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        paddingTop: "20px",
      }}
    >
      <p style={{ marginBottom: "10px", color: "#cbd5e1" }}>
        {label} ({platformId})
      </p>
      {renderMedia({ width: "100%", maxHeight: "400px", borderRadius: "8px" })}

      {data.file && (
        <div
          style={{
            fontSize: "0.9em",
            color: "#4ade80",
            marginTop: "10px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span>✓</span> Using platform-specific file ({data.file.name})
        </div>
      )}
    </div>
  );
};
