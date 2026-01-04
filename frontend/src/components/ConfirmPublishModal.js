import React from "react";
import "../ContentUploadForm.css";

export default function ConfirmPublishModal({
  open,
  platforms = [],
  title,
  description,
  hashtags = [],
  tiktokConsentChecked,
  setTiktokConsentChecked,
  onClose,
  onConfirm,
}) {
  if (!open) return null;
  const hasTikTok = platforms.includes("tiktok");
  const canConfirm = !hasTikTok || !!tiktokConsentChecked;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>Confirm & Publish</h3>
        <p>
          You are about to publish the following content to: <strong>{platforms.join(", ")}</strong>
        </p>
        <div className="modal-row">
          <label>Title</label>
          <div>{title}</div>
        </div>
        <div className="modal-row">
          <label>Description</label>
          <div style={{ whiteSpace: "pre-wrap" }}>{description}</div>
        </div>
        <div className="modal-row">
          <label>Hashtags</label>
          <div>{(hashtags || []).map(h => `#${h}`).join(" ")}</div>
        </div>
        {hasTikTok && (
          <div className="modal-row">
            <label>
              <input
                type="checkbox"
                checked={!!tiktokConsentChecked}
                onChange={e => setTiktokConsentChecked(!!e.target.checked)}
              />
              I explicitly consent to publish this content to TikTok and confirm it follows TikTok
              policies.
            </label>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose} aria-label="Cancel publish">
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm && onConfirm()}
            disabled={!canConfirm}
            aria-label="Confirm publish"
          >
            Confirm & Publish
          </button>
        </div>
      </div>
    </div>
  );
}
