import React, { useEffect, useState } from "react";
import "../ContentUploadForm.css";
import SmartFrameOverlay from "./SmartFrameOverlay";

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
      // Common shape: { hashtags: ["#fyp", "#tiktok"] }
      if (Array.isArray(h.hashtags)) {
        setHashtagsInput(h.hashtags.join(" "));
      } else if (typeof h.hashtags === "string") {
        setHashtagsInput(h.hashtags);
      } else if (h.original) setHashtagsInput(h.original);
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
        {preview && (
          <div
            style={{
              marginBottom: 12,
              height: 320,
              background: "#000",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <SmartFrameOverlay
              src={preview.mediaUrl || preview.thumbnail}
              mediaType={preview.mediaType === "video" ? "video" : "image"}
              platform={preview.platform || "generic"}
              showSafeZones={true}
              enableHighQuality={true}
            />
          </div>
        )}
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
