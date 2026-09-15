import React, { useEffect, useMemo, useState } from "react";
import { synthesizeEffect } from "./soundDesign";
import "./motion.css";

export default function SoundWaveform({ effect, playhead = 0, onSeek }) {
  const [decoded, setDecoded] = useState(null);
  const [status, setStatus] = useState("");
  const { url, builtIn, tone, duration, trimStart = 0, fadeIn, fadeOut, volume = 1 } = effect;
  useEffect(() => {
    setDecoded(null);
    if (builtIn || !url) return undefined;
    const controller = new AbortController();
    let cancelled = false,
      context;
    const load = async () => {
      setStatus("Loading waveform…");
      try {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) throw new Error("Audio decoding unavailable");
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Audio unavailable");
        context = new Ctor();
        const audio = await context.decodeAudioData(await response.arrayBuffer());
        if (!cancelled) {
          setDecoded({ samples: audio.getChannelData(0).slice(), rate: audio.sampleRate });
          setStatus("");
        }
      } catch (error) {
        if (!cancelled) setStatus("Waveform unavailable. Timing controls remain available.");
      } finally {
        context?.close?.();
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [url, builtIn]);

  const peaks = useMemo(() => {
    const rate = builtIn ? 48000 : decoded?.rate;
    const samples = builtIn
      ? synthesizeEffect({ tone, duration, fadeIn, fadeOut }, rate)
      : decoded?.samples;
    if (!samples || !rate) return [];
    return Array.from({ length: 96 }, (_, index) => {
      const from = Math.floor(((builtIn ? 0 : trimStart) + (index * duration) / 96) * rate);
      const to = Math.min(samples.length, Math.ceil(from + (duration * rate) / 96));
      let peak = 0;
      for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]));
      if (!builtIn) {
        const elapsed = ((index + 0.5) * duration) / 96;
        peak *= Math.min(
          1,
          elapsed / Math.max(0.001, fadeIn || 0),
          (duration - elapsed) / Math.max(0.005, fadeOut || 0)
        );
      }
      return peak;
    });
  }, [builtIn, tone, duration, trimStart, fadeIn, fadeOut, decoded]);
  const position = Math.max(0, Math.min(duration, playhead - effect.startTime));
  return (
    <div className="studio-sound-waveform">
      {peaks.length ? (
        <svg viewBox="0 0 384 64" role="img" aria-label="Sound effect waveform">
          <path d="M0 32H384" stroke="#3b4263" />
          {peaks.map((peak, i) => (
            <rect
              key={i}
              x={i * 4}
              y={32 - Math.max(0.5, peak * volume * 30)}
              width="2"
              height={Math.max(1, peak * volume * 60)}
              rx="1"
              fill="#b39aff"
            />
          ))}
          <path d={`M${(position / duration) * 384} 0v64`} stroke="#f8fafc" />
        </svg>
      ) : (
        <p role="status">{status}</p>
      )}
      <label>
        Seek within cue
        <input
          aria-label="Sound waveform position"
          type="range"
          min="0"
          max={duration}
          step="0.01"
          value={position}
          onChange={e => onSeek(effect.startTime + Number(e.target.value))}
        />
      </label>
    </div>
  );
}
