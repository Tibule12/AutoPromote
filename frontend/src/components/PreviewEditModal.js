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
    setHashtagsInput((preview && preview.hashtags && preview.hashtags.join(" ")) || "");
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
