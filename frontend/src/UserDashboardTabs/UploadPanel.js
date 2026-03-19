import React, { useEffect, useMemo, useState } from "react";
import UnifiedPublisher from "../features/publishing/UnifiedPublisher";
import { auth } from "../firebaseClient";
import "./UploadPanel.css";

function getItemKey(item) {
  return item.id || item.content_id || item.idempotency_key || item.url || item.title;
}

function getItemIdentifier(item) {
  return item.id || item.content_id || item.idempotency_key || null;
}

function getTimestamp(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function extractContentItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  return [];
}

function getMediaUrl(item) {
  return (
    item.processedUrl ||
    item.persistentMediaUrl ||
    item.url ||
    item.media_url ||
    item.video_url ||
    item.file_url ||
    null
  );
}

function getPlatforms(item) {
  if (Array.isArray(item.platforms)) return item.platforms;
  if (Array.isArray(item.target_platforms)) return item.target_platforms;
  if (item.platforms) return [item.platforms];
  if (item.target_platforms) return [item.target_platforms];
  return [];
}

function getStatus(item) {
  return item.status || item.approvalStatus || item.processing_status || "unknown";
}

function inferExtension(url, type) {
  try {
    const path = new URL(url, window.location.origin).pathname;
    const ext = path.split(".").pop();
    if (ext && ext.length <= 5) return ext;
  } catch (_err) {}
  if (type === "video") return "mp4";
  if (type === "audio") return "mp3";
  if (type === "image") return "jpg";
  return "bin";
}

function buildDownloadName(item) {
  const rawTitle = String(item.title || item.id || "autopromote-upload").trim();
  const safeTitle =
    rawTitle.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "autopromote-upload";
  return `${safeTitle}.${inferExtension(getMediaUrl(item), item.type)}`;
}

function getDownloadFilenameFromHeader(contentDisposition) {
  if (!contentDisposition) return null;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch (_err) {
      return utf8Match[1];
    }
  }
  const asciiMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return asciiMatch?.[1] || null;
}

function normalizeHistoryItem(item) {
  return {
    ...item,
    key: getItemKey(item),
    title:
      typeof item?.title === "string"
        ? item.title
        : item?.title
          ? JSON.stringify(item.title)
          : "Untitled",
    description: item.description || item.caption || item.commentary || "",
    status: getStatus(item),
    platforms: getPlatforms(item),
    createdMs: getTimestamp(item.createdAt || item.created_at || item.updatedAt || item.updated_at),
    mediaUrl: getMediaUrl(item),
    platformPostUrl: item.platform_post_url || item.share_url || null,
    type: item.type || item.mediaType || "video",
    autoRepostState: item.autoRepostState || null,
    repostCreative: item.repostCreative || null,
    repostPreview: item.repostPreview || null,
  };
}

function formatHashtagLine(tags) {
  return Array.isArray(tags) ? tags.filter(Boolean).join(" ") : "";
}

function getCreativeSnapshot(item) {
  return item?.repostPreview || item?.repostCreative || null;
}

function getNativePreviewFrame(platform) {
  const key = String(platform || "tiktok").toLowerCase();
  const frames = {
    tiktok: {
      shell: "For You",
      accent: "#111827",
      glow: "rgba(244,114,182,0.25)",
      pill: "Trending hook",
      handle: "@autopromote.creator",
    },
    instagram: {
      shell: "Reels",
      accent: "#1f2937",
      glow: "rgba(251,191,36,0.22)",
      pill: "Reel cover",
      handle: "autopromote.studio",
    },
    facebook: {
      shell: "Feed",
      accent: "#172554",
      glow: "rgba(96,165,250,0.22)",
      pill: "Feed card",
      handle: "AutoPromote Page",
    },
    youtube: {
      shell: "Shorts",
      accent: "#1f2937",
      glow: "rgba(248,113,113,0.22)",
      pill: "Shorts title",
      handle: "AutoPromote Shorts",
    },
  };
  return frames[key] || frames.tiktok;
}

function getPreferredRepostPlatform(item) {
  const replayPlatforms = Object.keys(item?.autoRepostState?.platforms || {});
  return String(replayPlatforms[0] || item?.platforms?.[0] || "tiktok").toLowerCase();
}

function getRepostSummary(item) {
  const platforms = item?.autoRepostState?.platforms;
  if (!platforms || typeof platforms !== "object") return null;

  const entries = Object.entries(platforms)
    .map(([platform, state]) => ({
      platform,
      attemptsScheduled: Number(state?.attemptsScheduled || 0),
      maxAttempts: Number(state?.maxAttempts || 0),
    }))
    .filter(entry => entry.maxAttempts > 0 || entry.attemptsScheduled > 0);

  if (entries.length === 0) return null;

  const attemptsScheduled = entries.reduce((sum, entry) => sum + entry.attemptsScheduled, 0);
  const maxAttempts = entries.reduce((sum, entry) => sum + entry.maxAttempts, 0);
  const label = entries
    .map(
      entry =>
        `${entry.platform.charAt(0).toUpperCase() + entry.platform.slice(1)} ${entry.attemptsScheduled}/${entry.maxAttempts}`
    )
    .join(" • ");

  return { attemptsScheduled, maxAttempts, label };
}

function UploadPanel({
  onUpload,
  initialFile,
  onClearInitialFile,
  initialTabOverride,
  onInitialTabHandled,
  contentList,
  platformMetadata,
  platformOptions,
  setPlatformOption,
  selectedPlatforms,
  setSelectedPlatforms,
  spotifySelectedTracks,
  setSpotifySelectedTracks,
  onNavigate,
}) {
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [activeTab, setActiveTab] = useState("upload");
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
  const [previewBusyKey, setPreviewBusyKey] = useState(null);
  const [previewAutoOpenKey, setPreviewAutoOpenKey] = useState(null);
  const [downloadBusyKey, setDownloadBusyKey] = useState(null);

  // Create a ref to track if we've handled the initial file so we only use it once
  const initialFileProcessed = React.useRef(false);

  // If initialFile is provided, ensure we are on the upload tab
  React.useEffect(() => {
    if (initialFile && !initialFileProcessed.current) {
      setActiveTab("upload");
      // We do NOT clear it here, UnifiedPublisher needs to mount and read it first
    }
  }, [initialFile]);

  React.useEffect(() => {
    if (!initialTabOverride) return;
    setActiveTab(initialTabOverride);
    onInitialTabHandled && onInitialTabHandled();
  }, [initialTabOverride, onInitialTabHandled]);

  const fallbackHistoryItems = useMemo(
    () =>
      (Array.isArray(contentList) ? contentList : [])
        .map(normalizeHistoryItem)
        .sort((a, b) => b.createdMs - a.createdMs),
    [contentList]
  );

  const displayHistoryItems = useMemo(() => {
    const source = historyLoaded ? historyItems : fallbackHistoryItems;
    return [...source].sort((a, b) => b.createdMs - a.createdMs);
  }, [fallbackHistoryItems, historyItems, historyLoaded]);

  const buildAuthHeaders = React.useCallback(async (includeJsonContentType = false) => {
    const headers = { Accept: "application/json" };
    if (includeJsonContentType) headers["Content-Type"] = "application/json";

    const currentUser = auth?.currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    } else if (typeof window !== "undefined" && window.firebaseAuthToken) {
      headers.Authorization = `Bearer ${window.firebaseAuthToken}`;
    }

    return headers;
  }, []);

  const fetchHistory = React.useCallback(async () => {
    try {
      setHistoryLoading(true);
      setHistoryError("");
      const headers = await buildAuthHeaders();

      const res = await fetch("/api/content/my-content?includeStats=0", {
        headers,
        credentials: "include",
      });

      if (res.status === 401) {
        setHistoryError("Please sign in again to load upload history.");
        return;
      }

      if (!res.ok) throw new Error(`history_fetch_failed_${res.status}`);

      const payload = await res.json();
      setHistoryItems(extractContentItems(payload).map(normalizeHistoryItem));
      setHistoryLoaded(true);
      setLastRefreshedAt(Date.now());
    } catch (err) {
      if (!String(err?.message || "").includes("history_fetch_failed_401")) {
        console.warn("fetchHistory failed", err);
      }
      setHistoryError("Could not refresh upload history right now.");
    } finally {
      setHistoryLoading(false);
    }
  }, [buildAuthHeaders]);

  const handleMediaClick = item => {
    if (item.type === "video" || item.type === "audio") {
      setSelectedMedia({ ...item, url: item.mediaUrl || item.url });
    }
  };

  const handlePreviewUrl = React.useCallback(
    preview => {
      if (!preview?.outputUrl) return;
      setSelectedMedia({
        title: preview.hookText || "Repost Preview",
        type: "video",
        url: preview.outputUrl,
        description: `Platform: ${preview.targetPlatform || "default"}`,
        platforms: preview.targetPlatform ? [preview.targetPlatform] : [],
        views: 0,
        clicks: 0,
      });
    },
    [setSelectedMedia]
  );

  const handleGenerateRepostPreview = React.useCallback(
    async item => {
      const identifier = getItemIdentifier(item);
      if (!identifier) return;

      try {
        setPreviewBusyKey(item.key);
        setHistoryError("");
        const headers = await buildAuthHeaders(true);

        const res = await fetch(`/api/content/${encodeURIComponent(identifier)}/repost-preview`, {
          method: "POST",
          headers,
          credentials: "include",
          body: JSON.stringify({
            platform: getPreferredRepostPlatform(item),
            runNow: false,
          }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || `preview_failed_${res.status}`);
        }

        if (payload?.preview?.outputUrl) {
          handlePreviewUrl(payload.preview);
          setPreviewBusyKey(null);
          setPreviewAutoOpenKey(null);
        } else {
          setPreviewAutoOpenKey(item.key);
        }
        await fetchHistory();
      } catch (error) {
        console.warn("repost preview failed", error);
        setHistoryError("Could not build the repost preview right now.");
      } finally {
        setPreviewBusyKey(null);
      }
    },
    [buildAuthHeaders, fetchHistory, handlePreviewUrl]
  );

  const handleDownloadMedia = React.useCallback(
    async item => {
      const identifier = getItemIdentifier(item);
      const fallbackMediaUrl = item.mediaUrl || getMediaUrl(item);
      const downloadUrl = identifier
        ? `/api/content/${encodeURIComponent(identifier)}/download`
        : fallbackMediaUrl;

      if (!downloadUrl) {
        setHistoryError("No downloadable media was found for this upload.");
        return;
      }

      try {
        setDownloadBusyKey(item.key);
        setHistoryError("");
        const headers = await buildAuthHeaders();
        const res = await fetch(downloadUrl, {
          headers,
          credentials: "include",
        });

        if (res.status === 401) {
          setHistoryError("Please sign in again to download this media.");
          return;
        }

        if (!res.ok) {
          throw new Error(`download_failed_${res.status}`);
        }

        const blob = await res.blob();
        const objectUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download =
          getDownloadFilenameFromHeader(res.headers.get("content-disposition")) ||
          buildDownloadName(item);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 0);
      } catch (error) {
        console.warn("download media failed", error);
        setHistoryError("Could not download this media right now.");
      } finally {
        setDownloadBusyKey(null);
      }
    },
    [buildAuthHeaders]
  );

  const closeModal = () => {
    setSelectedMedia(null);
  };

  useEffect(() => {
    if (activeTab === "history") {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  useEffect(() => {
    if (activeTab !== "history") return undefined;
    const hasProcessingItems = displayHistoryItems.some(item => item.status === "processing");
    const hasPreviewInFlight = displayHistoryItems.some(
      item =>
        item.key === previewBusyKey &&
        ["queued", "processing"].includes(item?.repostPreview?.status)
    );
    if (!hasProcessingItems && !hasPreviewInFlight) return undefined;
    const intervalId = window.setInterval(
      () => {
        fetchHistory();
      },
      hasPreviewInFlight ? 7000 : 20000
    );
    return () => window.clearInterval(intervalId);
  }, [activeTab, displayHistoryItems, fetchHistory, previewBusyKey]);

  useEffect(() => {
    if (!previewBusyKey) return;
    const item = displayHistoryItems.find(entry => entry.key === previewBusyKey);
    const preview = item?.repostPreview;
    if (!preview) return;

    if (preview.status === "completed") {
      setPreviewBusyKey(null);
      if (previewAutoOpenKey === previewBusyKey && preview.outputUrl) {
        handlePreviewUrl(preview);
      }
      setPreviewAutoOpenKey(null);
      return;
    }

    if (preview.status === "failed") {
      setPreviewBusyKey(null);
      setPreviewAutoOpenKey(null);
      setHistoryError("Repost preview build failed. Try again.");
    }
  }, [displayHistoryItems, handlePreviewUrl, previewAutoOpenKey, previewBusyKey]);

  return (
    <section className="upload-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>
          {activeTab === "upload" ? "Upload Content" : "Upload History"}
        </h3>
        <div className="upload-nav" role="tablist" aria-label="Upload navigation">
          <button
            role="tab"
            aria-selected={activeTab === "upload"}
            className={`upload-nav-btn ${activeTab === "upload" ? "active" : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            Upload Content
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "history"}
            className={`upload-nav-btn ${activeTab === "history" ? "active" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            Upload History
          </button>
        </div>
      </div>

      {activeTab === "upload" && (
        <UnifiedPublisher
          onUpload={async params => {
            if (onUpload) {
              // Bridge old callback style to new object params
              await onUpload(params);
            }
            if (onClearInitialFile) onClearInitialFile();
          }}
          // Future: map these properly if needed or just use UnifiedPublisher's internal state
          initialFile={initialFile}
          // platformMetadata={platformMetadata}
          // platformOptions={platformOptions}
          // setPlatformOption={setPlatformOption}
          // selectedPlatforms={selectedPlatforms}
          // setSelectedPlatforms={setSelectedPlatforms}
          // spotifySelectedTracks={spotifySelectedTracks}
          // setSpotifySelectedTracks={setSpotifySelectedTracks}
          // onNavigate={onNavigate}
        />
      )}
      {activeTab === "history" && (
        <div className="upload-history" style={{ marginTop: "1.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "1rem",
            }}
          >
            <div>
              <h4 style={{ margin: 0 }}>Upload History</h4>
              <p style={{ margin: "0.4rem 0 0", color: "#94a3b8", fontSize: ".9rem" }}>
                Latest uploads, publishing state, and direct media actions.
              </p>
              {lastRefreshedAt ? (
                <div style={{ marginTop: ".35rem", color: "#64748b", fontSize: ".8rem" }}>
                  Last refreshed {new Date(lastRefreshedAt).toLocaleString()}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="edit-platform-btn"
              onClick={fetchHistory}
              disabled={historyLoading}
            >
              {historyLoading ? "Refreshing..." : "Refresh history"}
            </button>
          </div>

          {historyError ? (
            <div
              style={{
                marginBottom: "1rem",
                padding: ".8rem 1rem",
                borderRadius: 10,
                background: "rgba(239,68,68,0.08)",
                color: "#fecaca",
              }}
            >
              {historyError}
            </div>
          ) : null}

          {displayHistoryItems.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "#9aa4b2",
                background: "rgba(255,255,255,0.02)",
                borderRadius: 8,
              }}
            >
              <p>📤 No uploads yet</p>
              <p style={{ fontSize: ".875rem" }}>Upload your first content to get started!</p>
            </div>
          ) : (
            <div className="content-grid upload-history-grid">
              {displayHistoryItems.map(item => {
                const canPreview = item.type === "video" || item.type === "audio";
                const createdLabel = item.createdMs
                  ? new Date(item.createdMs).toLocaleString()
                  : "Unknown date";
                const repostSummary = getRepostSummary(item);
                const repostPreview = item.repostPreview;
                const repostCreative = item.repostCreative;
                const statusTone =
                  item.status === "published" || item.status === "approved"
                    ? { bg: "rgba(34,197,94,0.15)", color: "#86efac" }
                    : item.status === "processing"
                      ? { bg: "rgba(245,158,11,0.15)", color: "#fcd34d" }
                      : { bg: "rgba(148,163,184,0.15)", color: "#cbd5e1" };

                return (
                  <article
                    key={item.key}
                    className="content-card cute-card"
                    style={{
                      background:
                        "linear-gradient(180deg, rgba(15,23,42,0.9), rgba(15,23,42,0.72))",
                      border: "1px solid rgba(148,163,184,0.18)",
                      borderRadius: 16,
                      overflow: "hidden",
                      boxShadow: "0 12px 28px rgba(15,23,42,0.22)",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleMediaClick(item)}
                      style={{
                        width: "100%",
                        border: "none",
                        padding: 0,
                        background: "transparent",
                        textAlign: "left",
                        cursor: canPreview ? "pointer" : "default",
                      }}
                      disabled={!canPreview}
                    >
                      <div className="cute-video-thumb">
                        {item.mediaUrl && item.type === "video" ? (
                          <>
                            <video src={item.mediaUrl} className="cute-video" />
                            <div className="cute-play">▶</div>
                          </>
                        ) : item.mediaUrl && item.type === "image" ? (
                          <img src={item.mediaUrl} alt={item.title} className="cute-video" />
                        ) : item.mediaUrl && item.type === "audio" ? (
                          <div className="cute-placeholder">Audio ready</div>
                        ) : (
                          <div className="cute-placeholder">No media</div>
                        )}
                        <div className="cute-badge">{createdLabel}</div>
                      </div>
                    </button>

                    <div className="cute-meta" style={{ padding: "1rem" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: ".75rem",
                          alignItems: "flex-start",
                        }}
                      >
                        <div className="cute-title" style={{ color: "#f8fafc", fontSize: "1rem" }}>
                          {item.title}
                        </div>
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            padding: "0.3rem 0.55rem",
                            borderRadius: 999,
                            background: statusTone.bg,
                            color: statusTone.color,
                            fontSize: ".72rem",
                            textTransform: "capitalize",
                            fontWeight: 700,
                          }}
                        >
                          {item.status}
                        </span>
                      </div>
                      {item.description ? (
                        <div
                          className="cute-desc"
                          style={{ color: "#cbd5e1", marginTop: ".55rem" }}
                        >
                          {item.description}
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "flex",
                          gap: ".5rem",
                          flexWrap: "wrap",
                          marginTop: ".85rem",
                        }}
                      >
                        {item.platforms.map(platform => (
                          <span
                            key={`${item.key}-${platform}`}
                            className="platform-pill"
                            style={{ background: "rgba(59,130,246,0.16)", color: "#bfdbfe" }}
                          >
                            {String(platform).charAt(0).toUpperCase() + String(platform).slice(1)}
                          </span>
                        ))}
                        {item.views ? (
                          <span className="platform-pill">{item.views} views</span>
                        ) : null}
                        {item.clicks ? (
                          <span className="platform-pill">{item.clicks} clicks</span>
                        ) : null}
                        {repostSummary ? (
                          <span className="platform-pill">
                            Smart reposts {repostSummary.attemptsScheduled}/
                            {repostSummary.maxAttempts}
                          </span>
                        ) : null}
                      </div>

                      {repostSummary ? (
                        <div
                          style={{
                            marginTop: ".65rem",
                            color: "#93c5fd",
                            fontSize: ".82rem",
                            lineHeight: 1.45,
                          }}
                        >
                          {repostSummary.label}
                        </div>
                      ) : null}

                      {(repostCreative || repostPreview) && (
                        <div
                          style={{
                            marginTop: ".85rem",
                            padding: ".9rem 1rem",
                            borderRadius: 14,
                            background: "rgba(15,23,42,0.55)",
                            border: "1px solid rgba(56,189,248,0.18)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: ".75rem",
                              alignItems: "center",
                              marginBottom: ".45rem",
                            }}
                          >
                            <div style={{ color: "#e0f2fe", fontWeight: 700, fontSize: ".88rem" }}>
                              Repost Design Preview
                            </div>
                            <span
                              className="platform-pill"
                              style={{ background: "rgba(34,197,94,0.12)", color: "#bbf7d0" }}
                            >
                              {(
                                repostPreview?.targetPlatform ||
                                repostCreative?.targetPlatform ||
                                getPreferredRepostPlatform(item)
                              ).toUpperCase()}
                            </span>
                          </div>
                          <div style={{ color: "#f8fafc", fontWeight: 600, lineHeight: 1.45 }}>
                            {repostPreview?.hookText || repostCreative?.hookText || "Hook ready"}
                          </div>
                          <div
                            style={{
                              marginTop: ".55rem",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: ".45rem",
                              padding: ".34rem .58rem",
                              borderRadius: 999,
                              background: "rgba(250,204,21,0.14)",
                              border: "1px solid rgba(250,204,21,0.24)",
                              color: "#fde68a",
                              fontSize: ".75rem",
                              fontWeight: 700,
                            }}
                          >
                            Preview only
                            <span style={{ color: "#fef3c7", fontWeight: 500 }}>
                              Not published to any platform
                            </span>
                          </div>
                          <div
                            style={{
                              marginTop: ".45rem",
                              color: "#94a3b8",
                              fontSize: ".82rem",
                              lineHeight: 1.45,
                            }}
                          >
                            {repostPreview?.status === "completed"
                              ? `3-second cover intro, ${repostPreview?.captionsBurnedIn ? "burned captions on" : "caption fallback ready"}`
                              : repostPreview?.status === "failed"
                                ? `Preview failed: ${repostPreview?.error || "try again"}`
                                : `Profile ${(repostPreview?.profile || repostCreative?.profile || "smart_repost_preview_v1").replace(/_/g, " ")}`}
                          </div>

                          {(() => {
                            const creative = getCreativeSnapshot(item);
                            const platform =
                              creative?.targetPlatform ||
                              repostCreative?.targetPlatform ||
                              getPreferredRepostPlatform(item);
                            const frame = getNativePreviewFrame(platform);
                            const hashtagLine = formatHashtagLine(creative?.hashtags);
                            return (
                              <div
                                style={{
                                  marginTop: ".8rem",
                                  borderRadius: 18,
                                  overflow: "hidden",
                                  background: `linear-gradient(180deg, ${frame.accent}, rgba(15,23,42,0.94))`,
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  boxShadow: `0 16px 34px ${frame.glow}`,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: ".75rem .9rem",
                                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                                    background: "rgba(255,255,255,0.03)",
                                  }}
                                >
                                  <div>
                                    <div
                                      style={{
                                        color: "#f8fafc",
                                        fontWeight: 700,
                                        fontSize: ".86rem",
                                      }}
                                    >
                                      {creative?.previewLabel || frame.shell}
                                    </div>
                                    <div style={{ color: "#94a3b8", fontSize: ".72rem" }}>
                                      {creative?.creatorLine || "Native platform framing"} • Preview
                                      only
                                    </div>
                                  </div>
                                  <span
                                    style={{
                                      padding: ".28rem .58rem",
                                      borderRadius: 999,
                                      background: "rgba(255,255,255,0.08)",
                                      color: "#e2e8f0",
                                      fontSize: ".72rem",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {frame.pill}
                                  </span>
                                </div>

                                <div style={{ padding: ".95rem .95rem 1rem" }}>
                                  <div
                                    style={{
                                      color: "#cbd5e1",
                                      fontSize: ".72rem",
                                      marginBottom: ".45rem",
                                    }}
                                  >
                                    {frame.handle}
                                  </div>
                                  <div
                                    style={{
                                      color: "#ffffff",
                                      fontWeight: 800,
                                      fontSize: ".98rem",
                                      lineHeight: 1.3,
                                    }}
                                  >
                                    {creative?.title || item.title}
                                  </div>
                                  <div
                                    style={{
                                      marginTop: ".58rem",
                                      color: "#dbeafe",
                                      fontSize: ".84rem",
                                      lineHeight: 1.55,
                                      padding: ".7rem .75rem",
                                      borderRadius: 14,
                                      background: "rgba(15,23,42,0.52)",
                                      border: "1px solid rgba(96,165,250,0.16)",
                                    }}
                                  >
                                    {creative?.description ||
                                      creative?.caption ||
                                      item.description ||
                                      "Preview copy ready."}
                                  </div>
                                  {hashtagLine ? (
                                    <div
                                      style={{
                                        marginTop: ".6rem",
                                        color: "#93c5fd",
                                        fontSize: ".78rem",
                                        lineHeight: 1.45,
                                      }}
                                    >
                                      {hashtagLine}
                                    </div>
                                  ) : null}
                                  <div
                                    style={{
                                      marginTop: ".7rem",
                                      color: "#fcd34d",
                                      fontSize: ".72rem",
                                      lineHeight: 1.45,
                                    }}
                                  >
                                    This card is a design preview generated inside AutoPromote. It
                                    has not been posted live.
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      <div
                        className="cute-row"
                        style={{
                          marginTop: "1rem",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: ".6rem",
                        }}
                      >
                        {canPreview ? (
                          <button
                            type="button"
                            className="edit-platform-btn"
                            onClick={() => handleMediaClick(item)}
                          >
                            Preview
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="edit-platform-btn"
                          onClick={() => handleGenerateRepostPreview(item)}
                          disabled={previewBusyKey === item.key}
                        >
                          {previewBusyKey === item.key
                            ? "Building repost preview..."
                            : "Build repost preview"}
                        </button>
                        {repostPreview?.outputUrl ? (
                          <button
                            type="button"
                            className="edit-platform-btn"
                            onClick={() => handlePreviewUrl(repostPreview)}
                          >
                            Open repost preview
                          </button>
                        ) : null}
                        {item.mediaUrl ? (
                          <button
                            type="button"
                            className="edit-platform-btn"
                            onClick={event => {
                              event.stopPropagation();
                              handleDownloadMedia(item);
                            }}
                            disabled={downloadBusyKey === item.key}
                          >
                            {downloadBusyKey === item.key ? "Downloading..." : "Download media"}
                          </button>
                        ) : null}
                        {item.status === "processing" ? (
                          <button
                            type="button"
                            className="edit-platform-btn"
                            onClick={fetchHistory}
                          >
                            Refresh status
                          </button>
                        ) : null}
                        {item.platformPostUrl ? (
                          <a
                            href={item.platformPostUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={event => event.stopPropagation()}
                            style={{
                              color: "#93c5fd",
                              textDecoration: "none",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            View on platform
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Media Player Modal */}
      {selectedMedia && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
          onClick={closeModal}
        >
          <div
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              background: "#1a1a2e",
              borderRadius: 12,
              padding: "1.5rem",
              position: "relative",
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={closeModal}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                background: "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: "50%",
                width: 36,
                height: 36,
                fontSize: "1.25rem",
                cursor: "pointer",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>

            <h3 style={{ marginTop: 0, marginBottom: "1rem", color: "#eef2ff" }}>
              {selectedMedia.title || "Untitled"}
            </h3>

            {selectedMedia.type === "video" && (
              <video
                src={selectedMedia.url}
                controls
                autoPlay
                style={{
                  width: "100%",
                  maxHeight: "70vh",
                  borderRadius: 8,
                }}
              />
            )}

            {selectedMedia.type === "audio" && (
              <div style={{ padding: "2rem", textAlign: "center" }}>
                <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🎵</div>
                <audio
                  src={selectedMedia.url}
                  controls
                  autoPlay
                  style={{
                    width: "100%",
                    marginTop: "1rem",
                  }}
                />
              </div>
            )}

            {selectedMedia.description && (
              <p style={{ marginTop: "1rem", color: "#9aa4b2", fontSize: ".875rem" }}>
                {selectedMedia.description}
              </p>
            )}

            <div
              style={{
                display: "flex",
                gap: "1rem",
                marginTop: "1rem",
                fontSize: ".875rem",
                color: "#6b7280",
              }}
            >
              <span>📊 {selectedMedia.views || 0} views</span>
              <span>👆 {selectedMedia.clicks || 0} clicks</span>
              {selectedMedia.platforms && (
                <span>
                  📱{" "}
                  {Array.isArray(selectedMedia.platforms)
                    ? selectedMedia.platforms.join(", ")
                    : selectedMedia.platforms}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default UploadPanel;
