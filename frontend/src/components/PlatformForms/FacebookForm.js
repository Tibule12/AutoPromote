import React, { useState, useEffect } from "react";

const FacebookForm = ({
  onChange,
  initialData = {},
  globalTitle,
  globalDescription,
  pages = [],
  onFileChange,
  currentFile,
}) => {
  const [pageId, setPageId] = useState(initialData.pageId || pages[0]?.id || "");
  const [message, setMessage] = useState(initialData.message || globalDescription || "");
  const [postType, setPostType] = useState(initialData.postType || "feed"); // feed, story, reel
  const [isPaidPartnership, setIsPaidPartnership] = useState(
    initialData.isPaidPartnership || false
  );
  const [sponsorUser, setSponsorUser] = useState(initialData.sponsorUser || "");

  useEffect(() => {
    onChange({
      platform: "facebook",
      pageId,
      message,
      postType,
      isPaidPartnership,
      sponsorUser,
    });
  }, [pageId, message, postType, isPaidPartnership, sponsorUser]);

  return (
    <div className="platform-form facebook-form">
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "#1877F2" }}>
          f
        </span>{" "}
        Facebook Manager
      </h4>

      <div className="form-group-modern">
        <label className="form-label-bold">Media File</label>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
          {currentFile
            ? `Selected: ${currentFile.name}`
            : "Use global file or select unique file for Facebook"}
        </div>
        <input
          type="file"
          accept="video/*,image/*"
          onChange={e => onFileChange && onFileChange(e.target.files[0])}
          className="modern-input"
          style={{ padding: 8 }}
        />
      </div>

      {pages.length === 0 ? (
        <div className="alert-box warning">
          No Facebook Pages connected. Please connect a page in settings.
        </div>
      ) : (
        <div className="form-group-modern">
          <label>Post As (Identity)</label>
          <select
            className="modern-select"
            value={pageId}
            onChange={e => setPageId(e.target.value)}
          >
            {pages.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} (ID: {p.id})
              </option>
            ))}
          </select>
          <p className="legal-hint" style={{ marginTop: "4px" }}>
            <span style={{ color: "#888" }}>Page ID: {pageId}</span>
          </p>

          <div
            className="scope-info-box"
            style={{
              marginTop: "8px",
              padding: "12px",
              background: "#f0f2f5",
              borderRadius: "8px",
              border: "1px solid #e1e3e8",
              fontSize: "0.85rem",
            }}
          >
            <div
              style={{
                fontWeight: "600",
                marginBottom: "6px",
                color: "#1877F2",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>🔒</span> Data Access & Permissions
            </div>
            <p style={{ margin: 0, color: "#444", lineHeight: "1.4" }}>
              <strong>Why we need this:</strong>
            </p>
            <ul style={{ margin: "6px 0 0 20px", padding: 0, color: "#444", lineHeight: "1.4" }}>
              <li>
                <code
                  style={{
                    background: "#e4e6eb",
                    padding: "2px 4px",
                    borderRadius: "4px/2px",
                    fontFamily: "monospace",
                    color: "#333",
                  }}
                >
                  pages_show_list
                </code>
                : Used to display the list of Pages you manage in the dropdown above, so you can
                select where to post.
              </li>
              <li>
                <code
                  style={{
                    background: "#e4e6eb",
                    padding: "2px 4px",
                    borderRadius: "4px/2px",
                    fontFamily: "monospace",
                    color: "#333",
                  }}
                >
                  pages_manage_posts
                </code>
                : Used solely to publish this specific post to your selected Page timeline.
              </li>
              <li>
                <code
                  style={{
                    background: "#e4e6eb",
                    padding: "2px 4px",
                    borderRadius: "4px/2px",
                    fontFamily: "monospace",
                    color: "#333",
                  }}
                >
                  pages_read_engagement
                </code>
                : Used to display the likes and comments this post receives on your dashboard.
              </li>
              <li>
                <code
                  style={{
                    background: "#e4e6eb",
                    padding: "2px 4px",
                    borderRadius: "4px/2px",
                    fontFamily: "monospace",
                    color: "#333",
                  }}
                >
                  pages_manage_metadata
                </code>
                : Used to subscribe to page webhooks so we can track post performance automatically.
              </li>
            </ul>
            <p
              style={{
                margin: "8px 0 0 0",
                color: "#65676b",
                fontSize: "0.8rem",
                fontStyle: "italic",
                borderTop: "1px solid #e1e3e8",
                paddingTop: "6px",
              }}
            >
              <strong>User Privacy:</strong> We do not access your personal profile's private
              messages or modify your Page's admin settings.
            </p>
          </div>
        </div>
      )}

      <div className="form-group-modern">
        <label>Post Destination</label>
        <div className="card-selector">
          <div
            className={`card-option ${postType === "feed" ? "selected" : ""}`}
            onClick={() => setPostType("feed")}
          >
            <span className="emoji">📰</span>
            <span>News Feed</span>
          </div>
          <div
            className={`card-option ${postType === "reel" ? "selected" : ""}`}
            onClick={() => setPostType("reel")}
          >
            <span className="emoji">🎬</span>
            <span>Reels</span>
          </div>
          {/* Stories removed as they are not currently implemented in backend */}
        </div>
      </div>

      <div className="form-group-modern">
        <label>Post Text</label>
        <textarea
          className="modern-input"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="What's on your mind?"
          rows={4}
        />
      </div>

      <div className="commercial-section">
        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={isPaidPartnership}
            onChange={e => setIsPaidPartnership(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">Tag Sponsor (Branded Content)</span>
        </label>

        {isPaidPartnership && (
          <div className="sub-settings fade-in">
            <div className="form-group-modern" style={{ marginTop: "10px" }}>
              <label>Sponsor Name / Page URL</label>
              <input
                type="text"
                className="modern-input"
                placeholder="e.g. Nike"
                value={sponsorUser}
                onChange={e => setSponsorUser(e.target.value)}
              />
            </div>
          </div>
        )}

        <p className="legal-hint">
          Required for paid partnerships. Handshake tool must be enabled on your Page.
        </p>
      </div>

      <div
        style={{
          fontSize: "0.85rem",
          color: "#6b7280",
          marginTop: "12px",
          padding: "8px",
          backgroundColor: "#f3f4f6",
          borderRadius: "4px",
          border: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}
      >
        <span>ℹ️</span>
        <span>Note: Video processing may take a few minutes to reflect on your Facebook Page.</span>
      </div>
    </div>
  );
};

export default FacebookForm;
