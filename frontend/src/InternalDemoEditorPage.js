import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import MultiCamCombiner from "./components/MultiCamCombiner";
import { useAuth } from "./contexts/AuthContext";
import "./InternalDemoEditorPage.css";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

const guessMimeTypeFromUrl = url => {
  const value = String(url || "").toLowerCase();
  if (value.match(/\.(png|jpg|jpeg|webp|gif)(\?|#|$)/)) return "image/png";
  if (value.match(/\.(mov|m4v|webm)(\?|#|$)/)) return "video/quicktime";
  return "video/mp4";
};

const inferNameFromUrl = url => {
  try {
    const parsed = new URL(url);
    const rawName = parsed.pathname.split("/").filter(Boolean).pop();
    return rawName || "screen-recording.mp4";
  } catch {
    return "screen-recording.mp4";
  }
};

function InternalDemoEditorPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const fileInputRef = useRef(null);
  const screenRecorderRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenChunksRef = useRef([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [launchError, setLaunchError] = useState("");
  const [sessionPrimaryFile, setSessionPrimaryFile] = useState(null);
  const [sessionKey, setSessionKey] = useState(0);
  const [lastRender, setLastRender] = useState(null);
  const [isScreenRecording, setIsScreenRecording] = useState(false);
  const [screenRecordingStatus, setScreenRecordingStatus] = useState("");

  const isLocalDev = typeof window !== "undefined" && LOCAL_HOSTS.has(window.location.hostname);
  const canAccess = Boolean(user?.isAdmin || user?.role === "admin" || isLocalDev);

  const launchSourceLabel = useMemo(() => {
    if (selectedFile) return selectedFile.name;
    if (sourceUrl.trim()) return sourceUrl.trim();
    return "No source selected";
  }, [selectedFile, sourceUrl]);

  const handlePickFile = event => {
    const nextFile = event.target.files?.[0] || null;
    setSelectedFile(nextFile);
    if (nextFile) {
      setSourceUrl("");
      setLaunchError("");
    }
  };

  const releaseScreenCapture = () => {
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
    screenStreamRef.current = null;
    screenRecorderRef.current = null;
    setIsScreenRecording(false);
  };

  const stopScreenRecording = () => {
    const recorder = screenRecorderRef.current;
    if (recorder?.state === "recording") {
      setScreenRecordingStatus("Finishing synchronized screen recording…");
      recorder.stop();
    }
  };

  const startScreenRecording = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") {
      setLaunchError("This browser cannot record the screen. Use a current Chrome, Edge, or Firefox build.");
      return;
    }
    try {
      setLaunchError("");
      setScreenRecordingStatus("Choose a browser tab and enable Share tab audio.");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 60 } },
        audio: true,
      });
      const mimeType = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      screenChunksRef.current = [];
      screenStreamRef.current = stream;
      screenRecorderRef.current = recorder;
      recorder.ondataavailable = event => {
        if (event.data?.size) screenChunksRef.current.push(event.data);
      };
      recorder.onerror = event => {
        setLaunchError(event.error?.message || "The screen recording stopped unexpectedly.");
        releaseScreenCapture();
      };
      recorder.onstop = () => {
        const chunks = screenChunksRef.current;
        const outputType = recorder.mimeType || mimeType || "video/webm";
        if (chunks.length) {
          const blob = new Blob(chunks, { type: outputType });
          const stamp = new Date().toISOString().replace(/[:.]/g, "-");
          const file = new File([blob], `autopromote-screen-${stamp}.webm`, { type: outputType });
          setSelectedFile(file);
          setSourceUrl("");
          setScreenRecordingStatus(
            stream.getAudioTracks().length
              ? "Screen and tab audio captured on one synchronized track. Ready to edit."
              : "Screen captured without tab audio. Record again and enable Share tab audio for synchronized sound."
          );
        } else {
          setLaunchError("The browser stopped before any screen video was captured.");
          setScreenRecordingStatus("");
        }
        screenChunksRef.current = [];
        releaseScreenCapture();
      };
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (recorder.state === "recording") recorder.stop();
      }, { once: true });
      recorder.start(250);
      setIsScreenRecording(true);
      setScreenRecordingStatus(
        stream.getAudioTracks().length
          ? "Recording screen + tab audio together. Perform the demo, then stop recording."
          : "Recording screen only. Stop and record again with Share tab audio enabled if sound is required."
      );
    } catch (error) {
      releaseScreenCapture();
      if (error?.name === "NotAllowedError") {
        setScreenRecordingStatus("Screen recording was cancelled.");
        return;
      }
      setLaunchError(error?.message || "Could not start screen recording.");
      setScreenRecordingStatus("");
    }
  };

  useEffect(() => () => {
    const recorder = screenRecorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
    screenStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  const buildPrimarySource = () => {
    if (selectedFile) return selectedFile;
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl) return null;
    return {
      url: trimmedUrl,
      isRemote: true,
      name: inferNameFromUrl(trimmedUrl),
      type: guessMimeTypeFromUrl(trimmedUrl),
    };
  };

  const handleLaunch = () => {
    const nextPrimarySource = buildPrimarySource();
    if (!nextPrimarySource) {
      setLaunchError("Choose a screen recording file or paste a direct video URL first.");
      return;
    }
    setLaunchError("");
    setLastRender(null);
    setSessionPrimaryFile(nextPrimarySource);
    setSessionKey(current => current + 1);
  };

  const handleResetSource = () => {
    setSelectedFile(null);
    setSourceUrl("");
    setLaunchError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (loading) {
    return <div className="internal-demo-editor-page"><div className="internal-demo-editor-shell">Checking access…</div></div>;
  }

  if (!canAccess) {
    return (
      <div className="internal-demo-editor-page">
        <div className="internal-demo-editor-shell">
          <div className="internal-demo-editor-card">
            <p className="internal-demo-editor-kicker">Internal Only</p>
            <h1>Demo Editor</h1>
            <p>
              This route is reserved for founder/admin demo editing and is intentionally hidden from normal product navigation.
            </p>
            <div className="internal-demo-editor-actions">
              <button type="button" className="internal-demo-editor-primary" onClick={() => navigate("/")}>
                Return Home
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (sessionPrimaryFile) {
    return (
      <MultiCamCombiner
        key={`demo-editor-session-${sessionKey}`}
        primaryFile={sessionPrimaryFile}
        onCancel={() => setSessionPrimaryFile(null)}
        onComplete={result => {
          setLastRender(result || null);
          setSessionPrimaryFile(null);
        }}
        onStatusChange={() => {}}
      />
    );
  }

  return (
    <div className="internal-demo-editor-page">
      <div className="internal-demo-editor-shell">
        <section className="internal-demo-editor-card internal-demo-editor-hero">
          <p className="internal-demo-editor-kicker">Founder Workflow</p>
          <h1>Internal Demo Editor</h1>
          <p>
            Private screen-recording polish workspace for AutoPromote demos. Manual timeline control stays in charge, while you can still add clean external audio, reframe important UI moments, trim dead time, and export social-ready vertical or square cuts.
          </p>
        </section>

        <section className="internal-demo-editor-grid">
          <div className="internal-demo-editor-card">
            <h2>Load Demo Source</h2>
            <p className="internal-demo-editor-note">
              Record a browser tab with its audio on one synchronized stream, upload an existing recording, or use a direct internal video URL. Public navigation is unchanged; this route is only reachable by URL.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*,image/*"
              className="internal-demo-editor-hidden-input"
              onChange={handlePickFile}
            />
            <div className="internal-demo-editor-actions">
              <button
                type="button"
                className={isScreenRecording ? "internal-demo-editor-stop" : "internal-demo-editor-primary"}
                onClick={isScreenRecording ? stopScreenRecording : startScreenRecording}
              >
                {isScreenRecording ? "Stop Recording" : "Record Screen + Tab Audio"}
              </button>
              <button
                type="button"
                className="internal-demo-editor-secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={isScreenRecording}
              >
                Upload Screen Recording
              </button>
              <button
                type="button"
                className="internal-demo-editor-secondary"
                onClick={handleResetSource}
                disabled={isScreenRecording}
              >
                Clear
              </button>
            </div>
            {screenRecordingStatus ? (
              <p className="internal-demo-editor-capture-status" role="status" aria-live="polite">
                {isScreenRecording ? <span className="internal-demo-editor-record-dot" aria-hidden="true" /> : null}
                {screenRecordingStatus}
              </p>
            ) : null}
            <label className="internal-demo-editor-field">
              <span>Or paste a direct video URL</span>
              <input
                type="url"
                value={sourceUrl}
                onChange={event => {
                  setSourceUrl(event.target.value);
                  if (event.target.value.trim()) {
                    setSelectedFile(null);
                    setLaunchError("");
                  }
                }}
                placeholder="https://..."
              />
            </label>
            <div className="internal-demo-editor-source-pill">{launchSourceLabel}</div>
            {launchError ? <p className="internal-demo-editor-error">{launchError}</p> : null}
            <div className="internal-demo-editor-actions">
              <button type="button" className="internal-demo-editor-primary" onClick={handleLaunch}>
                Open Demo Workspace
              </button>
            </div>
          </div>

          <div className="internal-demo-editor-card">
            <h2>What This Workspace Is For</h2>
            <ul className="internal-demo-editor-list">
              <li>Manual screen-demo editing when Smart Promo or auto-directing is not the right fit.</li>
              <li>Keeping external clean audio as the master track while trimming or reframing visuals.</li>
              <li>Cutting dead air, speeding up loading/wait sections, and keeping one screen from sitting too long.</li>
              <li>Punching into UI details with single-source reframing and focus picking.</li>
              <li>Exporting `9:16`, `1:1`, and other social-ready aspect ratios from the same session.</li>
            </ul>
          </div>
        </section>

        <section className="internal-demo-editor-grid">
          <div className="internal-demo-editor-card">
            <h2>Recommended Founder Workflow</h2>
            <ol className="internal-demo-editor-list internal-demo-editor-list-numbered">
              <li>Upload the screen recording and stay in single-camera edit mode.</li>
              <li>Add external clean audio inside the workspace if your mic track is better than the recorded system audio.</li>
              <li>Trim static sections, split dull moments, and vary framing so the eye keeps moving.</li>
              <li>Use vertical or square export at the end depending on where you want to post the demo.</li>
            </ol>
          </div>

          <div className="internal-demo-editor-card">
            <h2>Last Render</h2>
            {lastRender?.url ? (
              <>
                <p className="internal-demo-editor-note">
                  Your most recent demo export is ready.
                </p>
                <a
                  className="internal-demo-editor-link"
                  href={lastRender.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open rendered demo
                </a>
              </>
            ) : (
              <p className="internal-demo-editor-note">
                No demo export captured yet in this session.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default InternalDemoEditorPage;
