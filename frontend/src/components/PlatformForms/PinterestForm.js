import React, { useState, useEffect } from "react";
import ImageCropper from "../ImageCropper";
import { OPTIMAL_TIMES } from "../BestTimeToPost";

const PinterestForm = ({
  onChange,
  initialData = {},
  globalTitle,
  globalDescription,
  boards = [],
  onFileChange,
  currentFile,
}) => {
  const [boardId, setBoardId] = useState(initialData.boardId || boards[0]?.id || "");
  const [title, setTitle] = useState(initialData.title || globalTitle || "");
  const [description, setDescription] = useState(
    initialData.description || globalDescription || ""
  );
  const [link, setLink] = useState(initialData.link || "");
  const [isPaidPartnership, setIsPaidPartnership] = useState(
    initialData.isPaidPartnership || false
  );
  const [showCrop, setShowCrop] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (currentFile && currentFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(currentFile);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [currentFile]);

  useEffect(() => {
    onChange({
      platform: "pinterest",
      boardId,
      title,
      description,
      link,
      isPaidPartnership,
    });
  }, [boardId, title, description, link, isPaidPartnership]);

  return (
    <div className="platform-form pinterest-form">
      <h4 className="platform-form-header">
        <span className="icon" style={{ color: "#E60023" }}>
          📌
        </span>{" "}
        Pinterest Pin
      </h4>

      {OPTIMAL_TIMES.pinterest && (
        <div
          style={{
            fontSize: "11px",
            color: "#b91c1c",
            marginBottom: "12px",
            padding: "8px 10px",
            backgroundColor: "#fef2f2",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            border: "1px solid #fecaca",
          }}
        >
          <span style={{ fontSize: "14px" }}>⏰</span>
          <span>
            <strong>Best time to upload:</strong>{" "}
            {OPTIMAL_TIMES.pinterest.days.slice(0, 2).join(", ")} @{" "}
            {OPTIMAL_TIMES.pinterest.hours[0]}:00.
          </span>
        </div>
      )}

      {/* File Upload Section */}
      <div className="form-group-modern">
        <label className="form-label-bold">Pin Image</label>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
          {currentFile
            ? `Selected: ${currentFile.name}`
            : "Use global file or select unique file for Pinterest"}
        </div>
        <input
          type="file"
          accept="image/*"
          onChange={e => onFileChange && onFileChange(e.target.files[0])}
          className="modern-input"
          style={{ padding: 8 }}
        />
        {previewUrl && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              className="action-link"
              style={{
                fontSize: 13,
                cursor: "pointer",
                background: "none",
                border: "none",
                color: "#E60023",
                fontWeight: 600,
              }}
              onClick={() => setShowCrop(true)}
            >
              ✂️ Crop Image
            </button>
          </div>
        )}
        {showCrop && previewUrl && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.8)",
              zIndex: 9999,
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <div style={{ background: "white", padding: 20, borderRadius: 8 }}>
              <ImageCropper imageUrl={previewUrl} onClose={() => setShowCrop(false)} />
              <button onClick={() => setShowCrop(false)} style={{ marginTop: 10 }}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {boards.length === 0 ? (
        <div className="alert-box warning">
          No Boards found. Please ensure you have created boards on Pinterest.
        </div>
      ) : (
        <div className="form-group-modern">
          <label>Board</label>
          <select
            className="modern-select"
            value={boardId}
            onChange={e => setBoardId(e.target.value)}
          >
            <option value="">Select a board...</option>
            {boards.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="form-group-modern">
        <label>Pin Title</label>
        <input
          type="text"
          className="modern-input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Add a catchy title"
          maxLength={100}
        />
      </div>

      <div className="form-group-modern">
        <label>Description</label>
        <textarea
          className="modern-input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Tell everyone what your Pin is about"
          rows={3}
          maxLength={500}
        />
      </div>

      <div className="form-group-modern">
        <label>Destination Link</label>
        <div className="input-with-icon">
          <span className="input-icon">🔗</span>
          <input
            type="url"
            className="modern-input"
            value={link}
            onChange={e => setLink(e.target.value)}
            placeholder="https://your-site.com"
          />
        </div>
      </div>

      <div className="commercial-section">
        <label className="checkbox-modern">
          <input
            type="checkbox"
            checked={isPaidPartnership}
            onChange={e => setIsPaidPartnership(e.target.checked)}
          />
          <span className="checkmark"></span>
          <span className="label-text">Paid Partnership</span>
        </label>
      </div>
    </div>
  );
};

export default PinterestForm;
