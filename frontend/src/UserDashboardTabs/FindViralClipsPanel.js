import React, { useEffect, useMemo, useRef, useState } from "react";
import ViralScanner from "../components/ViralScanner";
import { SafeVideo } from "../components/SafeMedia";
import {clipSelectionSettings} from '../utils/clipSelectionSettings';

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
  const [hasAnalysed,setHasAnalysed]=useState(false);
  const [targetLength, setTargetLength] = useState("30–60 seconds");
  const [destinations, setDestinations] = useState(DESTINATIONS);
  const [focus, setFocus] = useState('');
  const settings=useMemo(()=>clipSelectionSettings(targetLength,destinations,focus),[targetLength,destinations,focus]);
  const sourceVideoRef = useRef(null);
  const previewRangeRef = useRef(null);

  useEffect(() => {
    previewRangeRef.current=null;
    setSourceFile(initialFile || null);
    setSelectedClip(null);
    setSuggestedClips([]);
    setHasAnalysed(false);
    setScannerOpen(false);
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
    previewRangeRef.current = null;
    setSourceFile(file);
    setSelectedClip(null);
    setSuggestedClips([]);
    setHasAnalysed(false);
    setScannerOpen(false);
  };

  useEffect(()=>{setSuggestedClips([]);setSelectedClip(null);setHasAnalysed(false);previewRangeRef.current=null;},[settings]);

  const previewClip = clip => {
    const video = sourceVideoRef.current;
    if (!video) return;
    const start=Number(clip?.start),end=Number(clip?.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return;
    previewRangeRef.current={start:Math.max(0,start),end};
    video.currentTime = Math.max(0, start);
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
                <SafeVideo ref={sourceVideoRef} src={previewUrl} controls preload="metadata"
                  onTimeUpdate={event=>{if(previewRangeRef.current&&event.currentTarget.currentTime>=previewRangeRef.current.end){event.currentTarget.pause();previewRangeRef.current=null;}}}
                  onSeeked={event=>{const range=previewRangeRef.current;if(range&&(event.currentTarget.currentTime<range.start-.1||event.currentTarget.currentTime>range.end+.1))previewRangeRef.current=null;}} />
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
                <input type="file" accept="video/*" disabled={scannerOpen} onChange={handleFileChange} />
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
            <select aria-label="Target length" value={targetLength} disabled={scannerOpen} onChange={event => setTargetLength(event.target.value)}>
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
                  disabled={scannerOpen}
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
            What should we look for? (optional)
            <input aria-label="What should we look for? (optional)" value={focus} maxLength={200} disabled={scannerOpen} placeholder="Useful lessons, funny reactions, surprising answers…"
              onChange={event=>setFocus(event.target.value)} />
          </label>
          <div className="viral-caption-language-note" role="note">
            <strong>Multilingual captions</strong>
            <span>Spoken languages and code-switching stay original by default.</span>
            <small>English translation is optional inside the editable Clip Studio captions.</small>
          </div>

          <button
            type="button"
            className="check-quality viral-analyse-button"
            disabled={!sourceFile||!destinations.length||scannerOpen}
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
            selectionSettings={settings}
            sourceDurationSeconds={Number(sourceVideoRef.current?.duration) || 0}
            embedded
            autoStart
            onClose={() => setScannerOpen(false)}
            onUpgrade={() => {
              setScannerOpen(false);
              onUpgrade?.();
            }}
            onResults={clips => {
              setHasAnalysed(true);
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
              const confidence = clip.scoreConfidenceLabel || 'Review the source evidence';
              return (
                <article
                  key={clip.id || `${clip.start}-${clip.end}`}
                  className={selectedClip?.id === clip.id ? "selected" : ""}
                >
                  <span className="viral-moment-rank" aria-label={`Rank ${index+1}`}>{index + 1}</span>
                  <div className="viral-moment-copy">
                    <strong>
                      {clip.hookText || clip.reason || `Suggested moment ${index + 1}`}
                    </strong>
                    <small>
                      {Number(clip.start || 0).toFixed(1)}s –{" "}
                      {Number(clip.end || clip.start || 0).toFixed(1)}s
                    </small>
                    {clip.text||clip.transcript?<p>{String(clip.text||clip.transcript).slice(0,360)}</p>:null}
                    {Array.isArray(clip.reviewFlags)&&clip.reviewFlags.length?<small>{clip.reviewFlags.join(' · ')}</small>:null}
                  </div>
                  <div className="viral-moment-confidence">
                    <span>{confidence}</span>
                    <div aria-label={`Editorial score ${score} out of 100`}>
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
                      onClick={() => onOpenStudio?.(sourceFile, clip, suggestedClips)}
                    >
                      ✂ Create clip
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : hasAnalysed ? (
          <p role="status">No moments matched this scan. Try a shorter target length or a different brief, or review the source in Studio.</p>
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
