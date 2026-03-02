import React, { useState, useEffect } from "react";
import { sanitizeUrl } from "../../utils/security";

const LinkedInForm = ({
  onChange,
  initialData = {},
  creatorInfo, // Received from UnifiedPublisher (contains profile/companies)
  globalTitle,
  globalDescription,
  currentFile,
  onFileChange,
  onReviewAI,
  onFindViralClips,
}) => {
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);

  useEffect(() => {
    if (currentFile && currentFile instanceof File) {
      const url = URL.createObjectURL(currentFile);
      setVideoPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setVideoPreviewUrl(null);
    }
  }, [currentFile]);

  const [visibility, setVisibility] = useState(initialData.visibility || "PUBLIC");

  // Smart Sync State
  const [commentary, setCommentary] = useState(initialData.commentary || globalDescription || "");
  const [title, setTitle] = useState(initialData.title || globalTitle || ""); // For articles/videos
  const [isDirtyCommentary, setIsDirtyCommentary] = useState(!!initialData.commentary);
  const [isDirtyTitle, setIsDirtyTitle] = useState(!!initialData.title);

  const [companyId, setCompanyId] = useState(initialData.companyId || "");
  const [isPromotional, setIsPromotional] = useState(initialData.isPromotional || false);

  // Sync global descriptions if not manually edited
  useEffect(() => {
    if (!isDirtyCommentary && globalDescription) {
      setCommentary(globalDescription);
    }
  }, [globalDescription, isDirtyCommentary]);

  useEffect(() => {
    if (!isDirtyTitle && globalTitle) {
      setTitle(globalTitle);
    }
  }, [globalTitle, isDirtyTitle]);

  useEffect(() => {
    onChange({
      platform: "linkedin",
      visibility,
      commentary,
      title,
      companyId, // Export companyId
      isPromotional,
    });
  }, [visibility, commentary, title, companyId, isPromotional]);

  const handleCommentaryChange = e => {
    setCommentary(e.target.value);
    setIsDirtyCommentary(true);
  };

  const handleTitleChange = e => {
    setTitle(e.target.value);
    setIsDirtyTitle(true);
  };

  return (
    <div className="platform-form linkedin-form">
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "#0A66C2" }}>
          in
        </span>{" "}
        LinkedIn Professional
      </h4>

      {/* IDENTITY BADGE */}
      {creatorInfo && (
        <div
          className="identity-badge"
          style={{
            marginBottom: "16px",
            display: "flex",
            alignItems: "center",
            background: "#f3f6f8",
            padding: "8px",
            borderRadius: "6px",
          }}
        >
          {creatorInfo.profilePicture && (
            <img
              src={creatorInfo.profilePicture}
              alt="Profile"
              style={{ width: 32, height: 32, borderRadius: "50%", marginRight: 10 }}
            />
          )}
          <div>
            <div style={{ fontWeight: "600", color: "#333" }}>
              {creatorInfo.localizedFirstName} {creatorInfo.localizedLastName}
            </div>
            <div style={{ fontSize: "0.8rem", color: "#666" }}>Posting as Profile</div>
          </div>
        </div>
      )}

      <div className="form-group-modern">
        <label htmlFor="linkedin-company-id">Organization / Company ID (Required)</label>
        <input
          id="linkedin-company-id"
          type="text"
          className="modern-input"
          value={companyId}
          onChange={e => setCompanyId(e.target.value)}
          placeholder="e.g. 12345678"
        />
        <p className="help-text" style={{ fontSize: "0.75rem", color: "#666", marginTop: "4px" }}>
          The numeric ID of your LinkedIn Organization page.
        </p>
      </div>

      <div className="form-group-modern">
        <label htmlFor="linkedin-file-input" className="form-label-bold">
          Video File
        </label>
        <div
          style={{
            fontSize: 12,
            color: "#666",
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>
            {currentFile
              ? `Selected: ${currentFile.name}`
              : "Use global file or select unique file for LinkedIn"}
          </span>
          {currentFile && (
            <button
              type="button"
              onClick={() => onFileChange && onFileChange(null)}
              style={{
                background: "transparent",
                border: "1px solid #ef4444",
                color: "#ef4444",
                borderRadius: "4px",
                padding: "2px 8px",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          )}
        </div>
        <input
          id="linkedin-file-input"
          type="file"
          accept="video/*"
          onChange={e => onFileChange && onFileChange(e.target.files[0])}
          className="modern-input"
          style={{ padding: 8 }}
        />

        {/* --- REVIEW AI ENHANCEMENTS for LinkedIn --- */}
        {(onReviewAI || onFindViralClips) && (
          <div style={{ display: "flex", gap: "10px", marginTop: 8, marginBottom: 15 }}>
            {onReviewAI && (
              <button
                type="button"
                style={{
                  background: "linear-gradient(135deg, #0077b5 0%, #00a0dc 100%)",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  flex: 1,
                }}
                onClick={onReviewAI}
              >
                ✨ Review AI Enhancements
              </button>
            )}
            {onFindViralClips && (
              <button
                type="button"
                style={{
                  background: "linear-gradient(135deg, #FF416C 0%, #FF4B2B 100%)",
                  color: "white",
                  border: "none",
                  padding: "8px 16px",
                  borderRadius: "4px",
                  cursor: "pointer",
                  flex: 1,
                }}
                onClick={onFindViralClips}
              >
                🔥 Find Viral Clips
              </button>
            )}
          </div>
        )}

        {/* SIMPLE INLINE VIDEO PREVIEW */}
        {videoPreviewUrl && (currentFile?.type?.startsWith("video/") || !currentFile) && (
          <div style={{ marginTop: "10px" }}>
            <video
              src={sanitizeUrl(videoPreviewUrl)}
              controls
              style={{
                width: "100%",
                maxHeight: "300px",
                borderRadius: "8px",
                border: "1px solid #334155",
              }}
            />
          </div>
        )}
      </div>

      <div className="form-group-modern">
        <label>Post Text</label>
        <textarea
          className="modern-input"
          value={commentary}
          onChange={handleCommentaryChange}
          placeholder="Share your thoughts or professional update..."
          rows={4}
        />
      </div>

      <div className="form-group-modern">
        <label>Video Title (Optional)</label>
        <input
          type="text"
          className="modern-input"
          value={title}
          onChange={handleTitleChange}
          placeholder="Professional Video Title"
        />
      </div>

      <div className="commercial-section">
        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={isPromotional}
            onChange={e => setIsPromotional(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">Promotional Content (Sponsored)</span>
        </label>
      </div>

      <div className="form-group-modern">
        <label>Who can see this?</label>
        <select
          className="modern-select"
          value={visibility}
          onChange={e => setVisibility(e.target.value)}
        >
          <option value="PUBLIC">Anyone (Recommended)</option>
          <option value="CONNECTIONS">Connections Only</option>
        </select>
        <p className="help-text">
          Public posts can be seen by people off LinkedIn and are indexed by search engines.
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
        <span>Note: Video processing may take a few minutes to reflect on your LinkedIn Page.</span>
      </div>
    </div>
  );
};

export default LinkedInForm;
