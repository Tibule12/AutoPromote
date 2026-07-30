import React, { useEffect, useMemo, useState } from "react";
import ViralScanner from "../components/ViralScanner";

const DESTINATIONS = ["TikTok", "YouTube Shorts", "Instagram Reels"];

const sanitizeVideoUrl = value => {
  if (typeof value !== "string") return "";

  try {
    const parsed = new URL(value.trim(), window.location.origin);
    if (!["blob:", "http:", "https:"].includes(parsed.protocol)) return "";
    return encodeURI(parsed.href);
  } catch {
    return "";
  }
};

const FindViralClipsPanel = ({ initialFile = null, onOpenPublisher, onUpgrade }) => {
  const [sourceFile, setSourceFile] = useState(initialFile);
  const [previewUrl, setPreviewUrl] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedClip, setSelectedClip] = useState(null);
  const [targetLength, setTargetLength] = useState("30–60 seconds");
  const [captionLanguage, setCaptionLanguage] = useState("English");

  useEffect(() => {
    setSourceFile(initialFile || null);
  }, [initialFile]);

  useEffect(() => {
    if (!sourceFile) {
      setPreviewUrl("");
      return undefined;
    }

    if (typeof sourceFile === "string") {
      setPreviewUrl(sanitizeVideoUrl(sourceFile));
      return undefined;
    }

    if (sourceFile.url) {
      setPreviewUrl(sanitizeVideoUrl(sourceFile.url));
      return undefined;
    }

    if (!(sourceFile instanceof Blob)) {
      setPreviewUrl("");
      return undefined;
    }

    const nextPreviewUrl = URL.createObjectURL(sourceFile);
    setPreviewUrl(sanitizeVideoUrl(nextPreviewUrl));
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [sourceFile]);

  const sourceName = useMemo(
    () => sourceFile?.name || sourceFile?.fileName || "No source video selected",
    [sourceFile]
  );

  const handleFileChange = event => {
    const [file] = Array.from(event.target.files || []);
    if (!file) return;
    setSourceFile(file);
    setSelectedClip(null);
  };

  return (
    <section className="find-viral-clips-panel">
      <div className="viral-clips-workspace">
        <article className="viral-source-card">
          <div className="viral-card-heading">
            <div>
              <span>Source video</span>
              <h3>Choose the recording to analyse</h3>
            </div>
            <label className="btn-secondary viral-file-picker">
              Choose video
              <input type="file" accept="video/*" onChange={handleFileChange} />
            </label>
          </div>

          <div className={`viral-source-preview ${previewUrl ? "has-video" : ""}`}>
            {previewUrl ? (
              <video src={previewUrl} controls preload="metadata" />
            ) : (
              <div className="viral-source-empty">
                <span>▶</span>
                <strong>Drop in a finished video</strong>
                <small>MP4, MOV, or a saved Cam Combiner master</small>
              </div>
            )}
          </div>

          <div className="viral-source-meta">
            <span aria-hidden="true">▣</span>
            <div>
              <strong>{sourceName}</strong>
              <small>
                {sourceFile?.size
                  ? `${Math.max(1, Math.round(sourceFile.size / 1024 / 1024))} MB`
                  : "Ready when you select a source"}
              </small>
            </div>
          </div>
        </article>

        <aside className="viral-settings-card">
          <div className="viral-card-heading">
            <div>
              <span>Clip settings</span>
              <h3>Guide the analysis</h3>
            </div>
          </div>

          <label>
            Target length
            <select value={targetLength} onChange={event => setTargetLength(event.target.value)}>
              <option>15–30 seconds</option>
              <option>30–60 seconds</option>
              <option>60–90 seconds</option>
            </select>
          </label>

          <div className="viral-destination-field">
            <span>Destinations</span>
            <div>
              {DESTINATIONS.map(destination => (
                <span key={destination}>{destination}</span>
              ))}
            </div>
          </div>

          <label>
            Caption language
            <select
              value={captionLanguage}
              onChange={event => setCaptionLanguage(event.target.value)}
            >
              <option>English</option>
              <option>isiXhosa</option>
              <option>isiZulu</option>
              <option>None</option>
            </select>
          </label>

          <button
            type="button"
            className="check-quality viral-analyse-button"
            disabled={!sourceFile}
            onClick={() => setScannerOpen(true)}
          >
            ✦ Analyse video
          </button>
          <small className="viral-settings-note">
            Your existing plan and credit checks still run before anything is uploaded.
          </small>
        </aside>
      </div>

      <section className="viral-suggestions-shell">
        <div className="viral-card-heading">
          <div>
            <span>Suggested moments</span>
            <h3>{selectedClip ? "Selected clip" : "Your strongest moments will appear here"}</h3>
          </div>
          {selectedClip && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onOpenPublisher?.(sourceFile, selectedClip)}
            >
              Open in Publisher
            </button>
          )}
        </div>

        {selectedClip ? (
          <article className="viral-selected-moment">
            <span className="viral-score">{Math.round(selectedClip.score || 0)}%</span>
            <div>
              <strong>{selectedClip.reason || "AI-selected viral moment"}</strong>
              <small>
                {Number(selectedClip.start || 0).toFixed(1)}s –{" "}
                {Number(selectedClip.end || selectedClip.start || 0).toFixed(1)}s
              </small>
            </div>
            <span className="viral-moment-status">Ready for editing</span>
          </article>
        ) : (
          <div className="viral-suggestion-placeholders" aria-hidden="true">
            {[78, 62, 44].map((width, index) => (
              <div key={width}>
                <span>{index + 1}</span>
                <div>
                  <i style={{ width: `${width}%` }} />
                  <i style={{ width: `${Math.max(28, width - 22)}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {scannerOpen && sourceFile && (
        <ViralScanner
          file={sourceFile}
          onClose={() => setScannerOpen(false)}
          onUpgrade={() => {
            setScannerOpen(false);
            onUpgrade?.();
          }}
          onSelectClip={clip => {
            setSelectedClip(clip);
            setScannerOpen(false);
          }}
        />
      )}
    </section>
  );
};

export default FindViralClipsPanel;
