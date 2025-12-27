import React, { useState } from "react";
import ContentUploadForm from "../ContentUploadForm";

function UploadPanel({
  onUpload,
  contentList,
  platformMetadata,
  platformOptions,
  setPlatformOption,
  selectedPlatforms,
  setSelectedPlatforms,
  spotifySelectedTracks,
  setSpotifySelectedTracks,
}) {
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [activeTab, setActiveTab] = useState("upload");

  const handleMediaClick = item => {
    if (item.type === "video" || item.type === "audio") {
      setSelectedMedia(item);
    }
  };

  const closeModal = () => {
    setSelectedMedia(null);
  };

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
        <ContentUploadForm
          onUpload={onUpload}
          platformMetadata={platformMetadata}
          platformOptions={platformOptions}
          setPlatformOption={setPlatformOption}
          selectedPlatforms={selectedPlatforms}
          setSelectedPlatforms={setSelectedPlatforms}
          spotifySelectedTracks={spotifySelectedTracks}
          setSpotifySelectedTracks={setSpotifySelectedTracks}
        />
      )}
      {activeTab === "history" && (
        <div className="upload-history" style={{ marginTop: "1.5rem" }}>
          <h4>Upload History</h4>
          {!contentList || contentList.length === 0 ? (
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
              style={{
                display: "grid",
                gap: ".75rem",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              }}
            >
              {contentList.map((item, idx) => {
                const titleText =
                  typeof item?.title === "string"
                    ? item.title
                    : item?.title
                      ? JSON.stringify(item.title)
                      : "Untitled";
                const statusText =
                  typeof item?.status === "string"
                    ? item.status
                    : item?.status
                      ? JSON.stringify(item.status)
                      : "unknown";

                return (
                  <div
                    key={idx}
                    className="content-card cute-card"
                    onClick={() => handleMediaClick(item)}
                    role="button"
                    tabIndex={0}
                  >
                    {item.url && item.type === "video" && (
                      <div className="cute-video-thumb">
                        <video src={item.url} className="cute-video" />
                        <div className="cute-play">▶</div>
                        <div className="cute-badge">
                          {new Date(item.createdAt || Date.now()).toLocaleDateString()}
                        </div>
                      </div>
                    )}
                    <div className="cute-meta">
                      <div className="cute-title">{titleText}</div>
                      <div className="cute-sub">{statusText}</div>
                    </div>
                  </div>
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
