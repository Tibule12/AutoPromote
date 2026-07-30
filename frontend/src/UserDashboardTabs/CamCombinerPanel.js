import React, { useMemo, useState } from "react";
import MultiCamCombiner from "../components/MultiCamCombiner";
import "./CamCombinerPanel.css";

function CamCombinerPanel({ onClose, onUseExport, onFindViralClips }) {
  const [studioOpen, setStudioOpen] = useState(false);
  const [cameraFiles, setCameraFiles] = useState([null, null]);
  const [masterAudio, setMasterAudio] = useState(null);
  const [settings, setSettings] = useState({
    speakerDetection: true,
    reactionShots: true,
    minimumShotLength: "3 seconds",
    outputQuality: "1080p",
    useMasterAudio: true,
  });

  const loadedCameraCount = useMemo(() => cameraFiles.filter(Boolean).length, [cameraFiles]);

  const updateCamera = (index, file) => {
    setCameraFiles(current => {
      const next = [...current];
      next[index] = file || null;
      return next;
    });
  };

  if (!studioOpen) {
    return (
      <section className="dashboard-cam-combiner-page cam-combiner-setup">
        <ol className="cam-combiner-steps" aria-label="Cam Combiner workflow">
          {["Upload", "Auto-sync", "Review", "Export"].map((label, index) => (
            <li key={label} className={index === 0 ? "active" : ""}>
              <span>{index + 1}</span>
              <strong>{label}</strong>
            </li>
          ))}
        </ol>

        <div className="cam-combiner-setup-grid">
          <section className="cam-setup-card">
            <div className="cam-setup-heading">
              <div>
                <span>Uploaded recordings</span>
                <h3>Add every camera angle and your clean audio</h3>
              </div>
              <small>{loadedCameraCount}/2 cameras ready</small>
            </div>

            <div className="cam-recording-list">
              {cameraFiles.map((file, index) => (
                <label
                  key={`camera-${index + 1}`}
                  className={`cam-recording-row ${file ? "has-file" : ""}`}
                >
                  <span className="cam-recording-icon">▣</span>
                  <span>
                    <strong>Camera {index + 1}</strong>
                    <small>{file?.name || "Choose a video recording"}</small>
                  </span>
                  <em>{file ? "Ready" : "Choose file"}</em>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={event => updateCamera(index, event.target.files?.[0])}
                  />
                </label>
              ))}

              <label className="cam-recording-row cam-recording-add">
                <span className="cam-recording-icon">＋</span>
                <span>
                  <strong>Add another camera</strong>
                  <small>Optional third angle for reactions or wide shots</small>
                </span>
                <em>Choose file</em>
                <input
                  type="file"
                  accept="video/*"
                  onChange={event => {
                    const file = event.target.files?.[0];
                    if (file) setCameraFiles(current => [...current, file]);
                  }}
                />
              </label>

              <label className={`cam-recording-row master-audio ${masterAudio ? "has-file" : ""}`}>
                <span className="cam-recording-icon">≋</span>
                <span>
                  <strong>Master audio</strong>
                  <small>{masterAudio?.name || "WAV, MP3, M4A, or a clean video soundtrack"}</small>
                </span>
                <em>{masterAudio ? "Ready" : "Choose file"}</em>
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={event => setMasterAudio(event.target.files?.[0] || null)}
                />
              </label>
            </div>
          </section>

          <aside className="cam-setup-card cam-auto-settings">
            <div className="cam-setup-heading">
              <div>
                <span>Auto-edit settings</span>
                <h3>Decide how the first cut should behave</h3>
              </div>
            </div>

            {[
              [
                "speakerDetection",
                "Speaker detection",
                "Automatically find and follow the active speaker.",
              ],
              [
                "reactionShots",
                "Reaction shots",
                "Include listener reactions when the conversation calls for them.",
              ],
              [
                "useMasterAudio",
                "Use master audio",
                "Keep the clean track as the final programme audio.",
              ],
            ].map(([key, label, helper]) => (
              <label className="cam-setting-toggle" key={key}>
                <span>
                  <strong>{label}</strong>
                  <small>{helper}</small>
                </span>
                <input
                  type="checkbox"
                  checked={settings[key]}
                  onChange={event =>
                    setSettings(current => ({ ...current, [key]: event.target.checked }))
                  }
                />
                <i />
              </label>
            ))}

            <label className="cam-setting-select">
              <span>
                <strong>Minimum shot length</strong>
                <small>Prevents distracting rapid cuts.</small>
              </span>
              <select
                value={settings.minimumShotLength}
                onChange={event =>
                  setSettings(current => ({
                    ...current,
                    minimumShotLength: event.target.value,
                  }))
                }
              >
                <option>2 seconds</option>
                <option>3 seconds</option>
                <option>5 seconds</option>
                <option>8 seconds</option>
              </select>
            </label>

            <label className="cam-setting-select">
              <span>
                <strong>Output quality</strong>
                <small>The editor still confirms render settings before export.</small>
              </span>
              <select
                value={settings.outputQuality}
                onChange={event =>
                  setSettings(current => ({ ...current, outputQuality: event.target.value }))
                }
              >
                <option>720p</option>
                <option>1080p</option>
                <option>4K</option>
              </select>
            </label>
          </aside>
        </div>

        <section className="cam-workflow-strip">
          {[
            ["⌁", "Sync recordings", "Align every camera and the clean master track."],
            ["◎", "Detect active speakers", "Build the first camera-switching timeline."],
            ["▤", "Review before export", "Keep full control over cuts and finishing."],
          ].map(([icon, title, copy]) => (
            <article key={title}>
              <span>{icon}</span>
              <div>
                <strong>{title}</strong>
                <small>{copy}</small>
              </div>
            </article>
          ))}
        </section>

        <footer className="cam-setup-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Back to Overview
          </button>
          <button type="button" className="btn-secondary" onClick={() => setStudioOpen(true)}>
            Open empty editor
          </button>
          <button
            type="button"
            className="check-quality"
            disabled={!loadedCameraCount}
            onClick={() => setStudioOpen(true)}
          >
            ✦ Start Auto Edit
          </button>
        </footer>
      </section>
    );
  }

  return (
    <section className="dashboard-cam-combiner-page" aria-label="Cam Combiner workspace">
      <MultiCamCombiner
        primaryFile={cameraFiles[0] || null}
        initialFiles={cameraFiles.filter(Boolean)}
        initialExternalAudio={settings.useMasterAudio ? masterAudio : null}
        initialSettings={settings}
        onCancel={() => setStudioOpen(false)}
        onComplete={result => onUseExport?.(result)}
        onStatusChange={() => {}}
        onFindViralClips={source => onFindViralClips?.(source)}
      />
    </section>
  );
}

export default CamCombinerPanel;
