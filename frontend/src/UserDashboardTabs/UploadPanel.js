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
  return item.url || item.media_url || item.video_url || item.file_url || null;
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
  const safeTitle = rawTitle.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "") || "autopromote-upload";
  return `${safeTitle}.${inferExtension(getMediaUrl(item), item.type)}`;
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
  };
}

function UploadPanel({
  onUpload,
  initialFile,
  onClearInitialFile,
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

  // Create a ref to track if we've handled the initial file so we only use it once
  const initialFileProcessed = React.useRef(false);

  // If initialFile is provided, ensure we are on the upload tab
  React.useEffect(() => {
    if (initialFile && !initialFileProcessed.current) {
      setActiveTab("upload");
      // We do NOT clear it here, UnifiedPublisher needs to mount and read it first
    }
  }, [initialFile]);

  const fallbackHistoryItems = useMemo(
    () => (Array.isArray(contentList) ? contentList : []).map(normalizeHistoryItem).sort((a, b) => b.createdMs - a.createdMs),
    [contentList]
  );

  const displayHistoryItems = useMemo(() => {
    const source = historyLoaded ? historyItems : fallbackHistoryItems;
    return [...source].sort((a, b) => b.createdMs - a.createdMs);
  }, [fallbackHistoryItems, historyItems, historyLoaded]);

  const fetchHistory = React.useCallback(async () => {
    try {
      setHistoryLoading(true);
      setHistoryError("");
      const headers = { Accept: "application/json" };

      const currentUser = auth?.currentUser;
      if (currentUser) {
        const token = await currentUser.getIdToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      } else if (typeof window !== "undefined" && window.firebaseAuthToken) {
        // Fallback for legacy auth bootstrapping during local development.
        headers.Authorization = `Bearer ${window.firebaseAuthToken}`;
      }

      const res = await fetch("/api/content/my-content", {
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
  }, []);

  const handleMediaClick = item => {
    if (item.type === "video" || item.type === "audio") {
      setSelectedMedia(item);
    }
  };

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
    if (!hasProcessingItems) return undefined;
    const intervalId = window.setInterval(() => {
      fetchHistory();
    }, 20000);
    return () => window.clearInterval(intervalId);
  }, [activeTab, displayHistoryItems, fetchHistory]);

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
            <div style={{ marginBottom: "1rem", padding: ".8rem 1rem", borderRadius: 10, background: "rgba(239,68,68,0.08)", color: "#fecaca" }}>
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
            <div
              className="content-grid upload-history-grid"
            >
              {displayHistoryItems.map(item => {
                const canPreview = item.type === "video" || item.type === "audio";
                const createdLabel = item.createdMs
                  ? new Date(item.createdMs).toLocaleString()
                  : "Unknown date";
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
                      background: "linear-gradient(180deg, rgba(15,23,42,0.9), rgba(15,23,42,0.72))",
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
                      <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "flex-start" }}>
                        <div className="cute-title" style={{ color: "#f8fafc", fontSize: "1rem" }}>{item.title}</div>
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
                        <div className="cute-desc" style={{ color: "#cbd5e1", marginTop: ".55rem" }}>
                          {item.description}
                        </div>
                      ) : null}

                      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", marginTop: ".85rem" }}>
                        {item.platforms.map(platform => (
                          <span
                            key={`${item.key}-${platform}`}
                            className="platform-pill"
                            style={{ background: "rgba(59,130,246,0.16)", color: "#bfdbfe" }}
                          >
                            {String(platform).charAt(0).toUpperCase() + String(platform).slice(1)}
                          </span>
                        ))}
                        {item.views ? <span className="platform-pill">{item.views} views</span> : null}
                        {item.clicks ? <span className="platform-pill">{item.clicks} clicks</span> : null}
                      </div>

                      <div className="cute-row" style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: ".6rem" }}>
                        {canPreview ? (
                          <button
                            type="button"
                            className="edit-platform-btn"
                            onClick={() => handleMediaClick(item)}
                          >
                            Preview
                          </button>
                        ) : null}
                        {item.mediaUrl ? (
                          <a
                            href={
                              getItemIdentifier(item)
                                ? `/api/content/${encodeURIComponent(getItemIdentifier(item))}/download`
                                : item.mediaUrl
                            }
                            download={buildDownloadName(item)}
                            className="edit-platform-btn"
                            onClick={event => event.stopPropagation()}
                            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
                          >
                            Download media
                          </a>
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
                            style={{ color: "#93c5fd", textDecoration: "none", display: "inline-flex", alignItems: "center" }}
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
