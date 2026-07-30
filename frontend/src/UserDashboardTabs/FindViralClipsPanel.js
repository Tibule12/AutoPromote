import React, { useEffect, useMemo, useRef, useState } from "react";
import ViralScanner from "../components/ViralScanner";
import { SafeVideo } from "../components/SafeMedia";

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

const FindViralClipsPanel = ({ initialFile = null, onOpenStudio, onUpgrade }) => {
  const [sourceFile, setSourceFile] = useState(initialFile);
  const [previewUrl, setPreviewUrl] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [selectedClip, setSelectedClip] = useState(null);
  const [suggestedClips, setSuggestedClips] = useState([]);
  const [targetLength, setTargetLength] = useState("30–60 seconds");
  const [captionLanguage, setCaptionLanguage] = useState("English");
  const [destinations, setDestinations] = useState(DESTINATIONS);
  const sourceVideoRef = useRef(null);

  useEffect(() => {
    setSourceFile(initialFile || null);
    setSelectedClip(null);
    setSuggestedClips([]);
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
    setSuggestedClips([]);
    setScannerOpen(false);
  };

  const previewClip = clip => {
    const video = sourceVideoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Number(clip?.start || 0));
    const playback = video.play();
    if (typeof playback?.catch === "function") playback.catch(() => {});
    setSelectedClip(clip);
  };

  return (
    <section className="find-viral-clips-panel">
      <div className="viral-clips-workspace">
        <article className="viral-source-card">
          <div className="viral-card-heading">
            <h3>Source video</h3>
          </div>

          <div className="viral-source-media-row">
            <div className={`viral-source-preview ${previewUrl ? "has-video" : ""}`}>
              {previewUrl ? (
                <SafeVideo ref={sourceVideoRef} src={previewUrl} controls preload="metadata" />
              ) : (
                <div className="viral-source-empty">
                  <span>▶</span>
                  <strong>Drop in a finished video</strong>
                  <small>MP4, MOV, or a saved Cam Combiner master</small>
                </div>
              )}
            </div>

            <div className="viral-source-meta">
              <span aria-hidden="true">▱</span>
              <div>
                <strong>{sourceName}</strong>
                <small>
                  {sourceFile?.size
                    ? `${Math.max(1, Math.round(sourceFile.size / 1024 / 1024))} MB`
                    : "Select a finished video to begin"}
                </small>
              </div>
              <label className="btn-secondary viral-file-picker">
                {sourceFile ? "Choose another video" : "Choose video"}
                <input type="file" accept="video/*" onChange={handleFileChange} />
              </label>
            </div>
          </div>
        </article>

        <aside className="viral-settings-card">
          <div className="viral-card-heading">
            <h3>Clip settings</h3>
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
                <button
                  key={destination}
                  type="button"
                  className={destinations.includes(destination) ? "selected" : ""}
                  aria-pressed={destinations.includes(destination)}
                  onClick={() =>
                    setDestinations(current =>
                      current.includes(destination)
                        ? current.filter(item => item !== destination)
                        : [...current, destination]
                    )
                  }
                >
                  <span aria-hidden="true">
                    {destination === "TikTok" ? "♪" : destination === "YouTube Shorts" ? "▶" : "◎"}
                  </span>
                  {destination}
                  <b aria-hidden="true">✓</b>
                </button>
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
        </aside>
      </div>

      <section className="viral-suggestions-shell">
        <div className="viral-card-heading">
          <div>
            <h3>Suggested moments</h3>
            <small>
              {selectedClip
                ? "Review the detected moment before editing or publishing."
                : "Suggestions require creator review before editing or publishing."}
            </small>
          </div>
        </div>

        {scannerOpen && sourceFile ? (
          <ViralScanner
            file={sourceFile}
            embedded
            autoStart
            onClose={() => setScannerOpen(false)}
            onUpgrade={() => {
              setScannerOpen(false);
              onUpgrade?.();
            }}
            onResults={clips => {
              setSuggestedClips(clips);
              setSelectedClip(clips[0] || null);
              setScannerOpen(false);
            }}
            onSelectClip={clip => {
              setSuggestedClips(current =>
                current.some(item => item.id === clip.id) ? current : [...current, clip]
              );
              setSelectedClip(clip);
            }}
          />
        ) : suggestedClips.length ? (
          <div className="viral-moment-list">
            {suggestedClips.map((clip, index) => {
              const score = Math.round(Number(clip.score || clip.guidedScore || 0));
              const confidence = score >= 75 ? "High confidence" : "Medium confidence";
              return (
                <article
                  key={clip.id || `${clip.start}-${clip.end}`}
                  className={selectedClip?.id === clip.id ? "selected" : ""}
                >
                  <div className="viral-moment-thumbnail" aria-hidden="true">
                    <span>{index + 1}</span>
                    <i />
                  </div>
                  <div className="viral-moment-copy">
                    <strong>
                      {clip.hookText || clip.reason || `Suggested moment ${index + 1}`}
                    </strong>
                    <small>
                      {Number(clip.start || 0).toFixed(1)}s –{" "}
                      {Number(clip.end || clip.start || 0).toFixed(1)}s
                    </small>
                  </div>
                  <div className="viral-moment-confidence">
                    <span>{confidence}</span>
                    <div aria-label={`${score}% confidence`}>
                      {[20, 40, 60, 75, 90].map(threshold => (
                        <i key={threshold} className={score >= threshold ? "filled" : ""} />
                      ))}
                    </div>
                  </div>
                  <div className="viral-moment-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => previewClip(clip)}
                    >
                      ▷ Preview
                    </button>
                    <button
                      type="button"
                      className="check-quality"
                      onClick={() => onOpenStudio?.(sourceFile, clip)}
                    >
                      ✂ Create clip
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
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
    </section>
  );
};

export default FindViralClipsPanel;
