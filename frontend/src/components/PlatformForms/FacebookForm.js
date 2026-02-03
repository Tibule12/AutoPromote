import React, { useState, useEffect } from "react";

const FacebookForm = ({
  onChange,
  initialData = {},
  globalTitle,
  globalDescription,
  pages = [],
}) => {
  const [pageId, setPageId] = useState(initialData.pageId || pages[0]?.id || "");
  const [message, setMessage] = useState(initialData.message || globalDescription || "");
  const [postType, setPostType] = useState(initialData.postType || "feed"); // feed, story, reel

  useEffect(() => {
    onChange({
      platform: "facebook",
      pageId,
      message,
      postType,
    });
  }, [pageId, message, postType]);

  return (
    <div className="platform-form facebook-form">
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "#1877F2" }}>
          f
        </span>{" "}
        Facebook Manager
      </h4>

      {pages.length === 0 ? (
        <div className="alert-box warning">
          No Facebook Pages connected. Please connect a page in settings.
        </div>
      ) : (
        <div className="form-group-modern">
          <label>Post As</label>
          <select
            className="modern-select"
            value={pageId}
            onChange={e => setPageId(e.target.value)}
          >
            {pages.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
          {/* Story API often limited, but keeping for UI completeness if supported later */}
          <div
            className={`card-option ${postType === "story" ? "selected" : ""}`}
            onClick={() => setPostType("story")}
          >
            <span className="emoji">⏱️</span>
            <span>Story</span>
          </div>
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
        <div className="form-group-modern">
          <label className="checkbox-modern">
            <input
              type="checkbox"
              // Mock state for now as FB API for branded content is complex
              // but UI needs to show it.
              onChange={e => {
                if (e.target.checked)
                  alert(
                    "To use Branded Content on Facebook, please verify your page eligibility in Business Manager first."
                  );
              }}
            />
            <span className="checkmark"></span>
            <span className="label-text">Tag Sponsor (Branded Content)</span>
          </label>
          <p className="legal-hint">
            Required for paid partnerships. Handshake tool must be enabled on your Page.
          </p>
        </div>
      </div>
    </div>
  );
};

export default FacebookForm;
