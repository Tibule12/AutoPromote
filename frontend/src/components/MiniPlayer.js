import React, { useEffect, useRef, useState } from "react";
import PropTypes from "prop-types";
import "./spotify-card.css";

// Deterministic waveform peaks based on id string
function generatePeaks(id, count = 40) {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) | 0;
  const peaks = [];
  for (let i = 0; i < count; i++) {
    seed = (seed * 1664525 + 1013904223) | 0;
    const v = Math.abs(seed % 100) / 100;
    peaks.push(0.12 + v * 0.88);
  }
  return peaks;
}

function MiniPlayer({ track = {}, onClose }) {
  const audioRef = useRef(null);
  const closeBtnRef = useRef(null);
  const prevActiveRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [peaks] = useState(() => generatePeaks(track.id || track.uri || "", 48));

  useEffect(() => {
    if (!track.preview_url) return;
    // save previously focused element and focus close button for accessibility
    prevActiveRef.current = document.activeElement;
    const a = new Audio(track.preview_url);
    audioRef.current = a;
    const onLoaded = () => setDuration(audioRef.current?.duration || 30);
    const onTime = () => setTime(audioRef.current?.currentTime || 0);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("ended", () => setPlaying(false));
    // focus the close button after mount (synchronously for test stability)
    try {
      closeBtnRef.current && closeBtnRef.current.focus();
    } catch (e) {}

    return () => {
      if (audioRef.current) {
        try {
          audioRef.current.pause();
        } catch (e) {}
        audioRef.current.removeEventListener("loadedmetadata", onLoaded);
        audioRef.current.removeEventListener("timeupdate", onTime);
        audioRef.current = null;
      }
      // restore focus to previously focused element
      try {
        prevActiveRef.current?.focus && prevActiveRef.current.focus();
      } catch (e) {}
    };
  }, [track.preview_url]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.play().catch(() => setPlaying(false));
    else {
      try {
        audioRef.current.pause();
      } catch (e) {
        /* jsdom may not implement pause */
      }
    }
  }, [playing]);

  const togglePlay = () => setPlaying(p => !p);
  const seek = val => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = val;
    setTime(val);
  };

  const handleKeyDown = e => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose && onClose();
      return;
    }
    if (e.key === "Tab") {
      // simple focus trap and forward/backward navigation inside modal
      const focusables = Array.from(
        e.currentTarget.querySelectorAll('button, input, [tabindex]:not([tabindex="-1"])')
      ).filter(el => !el.hasAttribute("disabled"));
      if (focusables.length === 0) return;
      const idx = focusables.indexOf(document.activeElement);
      // determine next index based on Shift state (wrap around at ends)
      const nextIdx = e.shiftKey
        ? idx <= 0
          ? focusables.length - 1
          : idx - 1
        : idx >= focusables.length - 1
          ? 0
          : idx + 1;
      focusables[nextIdx].focus();
      e.preventDefault();
    }
  };
  return (
    <div
      className="mini-player-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${track.name || "track"}`}
      onKeyDown={handleKeyDown}
    >
      <div className="mini-player">
        <div className="mini-header">
          <div className="mini-title">{track.name}</div>
          <button
            ref={closeBtnRef}
            className="btn mini-close"
            onClick={onClose}
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>
        <div className="mini-body">
          <div className="waveform" aria-hidden="true">
            {peaks.map((p, i) => (
              <div key={i} className="peak" style={{ height: `${Math.round(p * 40)}px` }} />
            ))}
          </div>
          <div className="controls">
            <button
              className="btn btn-secondary mini-play"
              onClick={togglePlay}
              aria-pressed={playing}
              aria-label={playing ? "Pause preview" : "Play preview"}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <input
              type="range"
              className="mini-seek"
              min={0}
              max={Math.max(1, Math.round(duration))}
              value={Math.round(time)}
              onChange={e => seek(Number(e.target.value))}
              aria-label="Seek preview"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, Math.round(duration))}
              aria-valuenow={Math.round(time)}
            />
            <div className="time" aria-live="polite">
              {Math.round(time)} / {Math.round(duration)}
            </div>
          </div>
        </div>
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {playing ? "Playing" : "Paused"}
        </div>
      </div>
    </div>
  );
}

MiniPlayer.propTypes = {
  track: PropTypes.object,
  onClose: PropTypes.func,
};

export default MiniPlayer;
