import React, { useState, useEffect } from "react";

const LinkedInForm = ({
  onChange,
  initialData = {},
  globalTitle,
  globalDescription,
  currentFile,
  onFileChange,
}) => {
  const [visibility, setVisibility] = useState(initialData.visibility || "PUBLIC");
  const [commentary, setCommentary] = useState(initialData.commentary || globalDescription || "");
  const [title, setTitle] = useState(initialData.title || globalTitle || ""); // For articles/videos
  const [companyId, setCompanyId] = useState(initialData.companyId || "");
  const [isPromotional, setIsPromotional] = useState(initialData.isPromotional || false);

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

  return (
    <div className="platform-form linkedin-form">
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "#0A66C2" }}>
          in
        </span>{" "}
        LinkedIn Professional
      </h4>

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
        <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
          {currentFile
            ? `Selected: ${currentFile.name}`
            : "Use global file or select unique file for LinkedIn"}
        </div>
        <input
          id="linkedin-file-input"
          type="file"
          accept="video/*"
          onChange={e => onFileChange && onFileChange(e.target.files[0])}
          className="modern-input"
          style={{ padding: 8 }}
        />
      </div>

      <div className="form-group-modern">
        <label>Post Text</label>
        <textarea
          className="modern-input"
          value={commentary}
          onChange={e => setCommentary(e.target.value)}
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
          onChange={e => setTitle(e.target.value)}
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
