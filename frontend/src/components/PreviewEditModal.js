import React, { useEffect, useState } from "react";
import "../ContentUploadForm.css";

export default function PreviewEditModal({ open, preview, onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [hashtagsInput, setHashtagsInput] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(preview?.title || "");
    setDescription(preview?.description || "");
    // Normalize hashtags into a space-separated string. Handles arrays, strings, and structured objects.
    const h = preview?.hashtags;
    if (!h) {
      setHashtagsInput("");
    } else if (Array.isArray(h)) {
      setHashtagsInput(h.join(" "));
    } else if (typeof h === "string") {
      setHashtagsInput(h);
    } else if (typeof h === "object") {
      if (h.original) setHashtagsInput(h.original);
      else if (h.text) setHashtagsInput(h.text);
      else if (Array.isArray(h.suggestions)) setHashtagsInput(h.suggestions.join(" "));
      else setHashtagsInput(JSON.stringify(h));
    } else {
      setHashtagsInput(String(h));
    }
  }, [open, preview]);

  if (!open) return null;

  const handleSave = () => {
    const hashtags = (hashtagsInput || "")
      .split(/\s+/)
      .map(h => h.replace(/^#/, ""))
      .filter(Boolean);
    onSave && onSave({ title: title || "", description: description || "", hashtags });
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>Edit Preview</h3>
        {preview && (preview.mediaType === "video" ? (
          <div style={{ marginBottom: 12 }}>
            <video
              aria-label="Preview media"
              src={preview.mediaUrl || preview.thumbnail}
              controls
              style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 6 }}
            />
          </div>
        ) : preview.thumbnail ? (
          <div style={{ marginBottom: 12 }}>
            <img
              aria-label="Preview media"
              src={preview.mediaUrl || preview.thumbnail}
              alt="Preview media"
              style={{ width: "100%", maxHeight: 240, objectFit: "cover", borderRadius: 6 }}
            />
          </div>
        ) : null)}
        <div className="modal-row">
          <label>Title</label>
          <input
            className="form-input"
            value={title}
            onChange={e => setTitle(e.target.value)}
            aria-label="Edit preview title"
          />
        </div>
        <div className="modal-row">
          <label>Description</label>
          <textarea
            className="form-textarea"
            value={description}
            onChange={e => setDescription(e.target.value)}
            aria-label="Edit preview description"
          />
        </div>
        <div className="modal-row">
          <label>Hashtags (space separated)</label>
          <input
            className="form-input"
            value={hashtagsInput}
            onChange={e => setHashtagsInput(e.target.value)}
            aria-label="Edit preview hashtags"
            placeholder="#tag1 #tag2"
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} aria-label="Cancel edit">
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} aria-label="Save edit">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
