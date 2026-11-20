import React, { useMemo, useState } from "react";
import MultiCamCombiner from "../components/MultiCamCombiner";
import ProductHelpButton from "../components/ProductHelpButton";
import { MULTICAM_MAX_SOURCES } from "../components/multicamUtils";
import {
  normalizeMulticamSetup,
  MULTICAM_SHOT_LENGTHS,
  MULTICAM_RENDER_TREATMENTS,
} from "../components/multicamSetup";
import "./CamCombinerPanel.css";

function CamCombinerPanel({ onClose, onUseExport, onFindViralClips }) {
  const [studioSession, setStudioSession] = useState(null);
  const [cameraFiles, setCameraFiles] = useState([null, null]);
  const [masterAudio, setMasterAudio] = useState(null);
  const [settings, setSettings] = useState(() => normalizeMulticamSetup());

  const loadedCameraCount = useMemo(() => cameraFiles.filter(Boolean).length, [cameraFiles]);

  const updateCamera = (index, file) => {
    setCameraFiles(current => {
      const next = [...current];
      next[index] = file || null;
      return next;
    });
  };

  if (!studioSession) {
    return (
      <section className="dashboard-cam-combiner-page cam-combiner-setup">
        <ProductHelpButton
          featureId="cam_combiner.switching"
          label="Cam Combiner"
          workspaceType="CAM_COMBINER"
        />
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
              <small>
                {loadedCameraCount}/{MULTICAM_MAX_SOURCES} recordings selected
              </small>
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
                    aria-label={`Camera ${index + 1} recording`}
                    accept="video/*"
                    onChange={event => {
                      updateCamera(index, event.target.files?.[0]);
                      event.target.value = "";
                    }}
                  />
                  {file && (
                    <button
                      type="button"
                      aria-label={`Remove Camera ${index + 1}`}
                      onClick={event => {
                        event.preventDefault();
                        updateCamera(index, null);
                      }}
                    >
                      Remove
                    </button>
                  )}
                </label>
              ))}

              {cameraFiles.length < MULTICAM_MAX_SOURCES && (
                <label className="cam-recording-row cam-recording-add">
                  <span className="cam-recording-icon">＋</span>
                  <span>
                    <strong>Add another camera</strong>
                    <small>Optional third angle for reactions or wide shots</small>
                  </span>
                  <em>Choose file</em>
                  <input
                    type="file"
                    aria-label="Add another camera recording"
                    accept="video/*"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file)
                        setCameraFiles(current =>
                          current.length < MULTICAM_MAX_SOURCES ? [...current, file] : current
                        );
                      event.target.value = "";
                    }}
                  />
                </label>
              )}

              <label className={`cam-recording-row master-audio ${masterAudio ? "has-file" : ""}`}>
                <span className="cam-recording-icon">≋</span>
                <span>
                  <strong>Master audio</strong>
                  <small>{masterAudio?.name || "WAV, MP3, M4A, or a clean video soundtrack"}</small>
                </span>
                <em>{masterAudio ? "Ready" : "Choose file"}</em>
                <input
                  type="file"
                  aria-label="Master audio recording"
                  accept="audio/*,video/*"
                  onChange={event => {
                    setMasterAudio(event.target.files?.[0] || null);
                    event.target.value = "";
                  }}
                />
                {masterAudio && (
                  <button
                    type="button"
                    onClick={event => {
                      event.preventDefault();
                      setMasterAudio(null);
                    }}
                  >
                    Remove master audio
                  </button>
                )}
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
                aria-label="Minimum shot length"
                value={settings.minimumShotLengthSeconds}
                onChange={event =>
                  setSettings(current => ({
                    ...current,
                    minimumShotLengthSeconds: Number(event.target.value),
                  }))
                }
              >
                {MULTICAM_SHOT_LENGTHS.map(seconds => (
                  <option key={seconds} value={seconds}>
                    {seconds} seconds
                  </option>
                ))}
              </select>
            </label>

            <label className="cam-setting-select">
              <span>
                <strong>Render treatment</strong>
                <small>Choose the same finishing treatment available in the editor.</small>
              </span>
              <select
                aria-label="Render treatment"
                value={settings.renderTier}
                onChange={event =>
                  setSettings(current => ({ ...current, renderTier: event.target.value }))
                }
              >
                {MULTICAM_RENDER_TREATMENTS.map(tier => (
                  <option key={tier.id} value={tier.id}>
                    {tier.label}
                  </option>
                ))}
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
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setStudioSession({ files: [], audio: null, settings: {} })}
          >
            Open empty editor
          </button>
          <button
            type="button"
            className="check-quality"
            disabled={!loadedCameraCount}
            onClick={() =>
              setStudioSession({
                files: cameraFiles.filter(Boolean),
                audio: masterAudio,
                settings: normalizeMulticamSetup(settings),
              })
            }
          >
            ✦ Start Auto Edit
          </button>
        </footer>
      </section>
    );
  }

  return (
    <section className="dashboard-cam-combiner-page" aria-label="Cam Combiner workspace">
      <ProductHelpButton
        featureId="cam_combiner.switching"
        label="Cam Combiner"
        workspaceType="CAM_COMBINER"
      />
      <MultiCamCombiner
        primaryFile={studioSession.files[0] || null}
        initialFiles={studioSession.files}
        initialExternalAudio={studioSession.audio}
        initialSettings={studioSession.settings}
        onCancel={() => setStudioSession(null)}
        onComplete={result => onUseExport?.(result)}
        onStatusChange={() => {}}
        onFindViralClips={source => onFindViralClips?.(source)}
      />
    </section>
  );
}

export default CamCombinerPanel;
