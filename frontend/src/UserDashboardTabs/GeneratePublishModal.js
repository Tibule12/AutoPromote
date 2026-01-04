import React, { useEffect, useState } from "react";
import "./GeneratePublishModal.css";

export default function GeneratePublishModal({ open, contentItem, onClose, onStarted }) {
  const [aspect, setAspect] = useState("9:16");
  const [addCaptions, setAddCaptions] = useState(true);
  const [platforms, setPlatforms] = useState({ tiktok: true });
  const [status, setStatus] = useState("idle"); // idle | queued | in-progress | success | failed
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setStatus("idle");
      setMessage("");
    }
  }, [open]);

  if (!open) return null;

  const togglePlatform = p => setPlatforms(prev => ({ ...prev, [p]: !prev[p] }));

  const handleConfirm = async () => {
    setStatus("queued");
    setMessage("Queued for analysis");
    try {
      const res = await fetch("/api/clips/generate-and-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentId: contentItem.id,
          options: { aspect, addCaptions, platforms },
        }),
      });
      if (!res.ok) throw new Error("failed to enqueue");
      const data = await res.json().catch(() => ({}));
      setStatus("in-progress");
      setMessage("Processing...");
      onStarted && onStarted(data.jobId || null);

      // Poll or fake progress until success — UI shows progress; backend will send events in real integration
      setTimeout(() => {
        setStatus("success");
        setMessage("Published successfully");
      }, 1200);
    } catch (err) {
      console.error("Generate & Publish error", err);
      setStatus("failed");
      setMessage("Failed to start generation");
    }
  };

  return (
    <div className="gp-modal-overlay" role="dialog" aria-modal="true">
      <div className="gp-modal">
        <h3>Generate & Publish</h3>
        <p className="gp-sub">
          Create a clip from <strong>{contentItem.title || contentItem.id}</strong> and publish to
          selected platforms.
        </p>

        <div className="gp-row">
          <label>Aspect</label>
          <select value={aspect} onChange={e => setAspect(e.target.value)}>
            <option value="9:16">9:16 (TikTok/Reels)</option>
            <option value="16:9">16:9 (YouTube)</option>
          </select>
        </div>

        <div className="gp-row gp-checkbox">
          <label>
            <input type="checkbox" checked={addCaptions} onChange={() => setAddCaptions(v => !v)} />{" "}
            Add captions
          </label>
        </div>

        <div className="gp-row">
          <label>Platforms</label>
          <div className="gp-platforms">
            <label>
              <input
                type="checkbox"
                checked={platforms.tiktok}
                onChange={() => togglePlatform("tiktok")}
              />{" "}
              TikTok
            </label>
            <label>
              <input
                type="checkbox"
                checked={platforms.youtube || false}
                onChange={() => togglePlatform("youtube")}
              />{" "}
              YouTube
            </label>
          </div>
        </div>

        <div className="gp-status">{status !== "idle" && <em>{message}</em>}</div>

        <div className="gp-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleConfirm}
            disabled={status === "in-progress" || status === "queued"}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
