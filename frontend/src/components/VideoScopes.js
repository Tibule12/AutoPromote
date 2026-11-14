import React, { useEffect, useRef, useState } from "react";
import { SKIN_TONE_LINE_ANGLE_DEG, computeColorScopesFromRgba } from "./studioColorScopes";

const drawHistogram = (context, histogram, width, height, color, left, bandWidth) => {
  const max = Math.max(1, ...histogram);
  context.beginPath();
  histogram.forEach((value, index) => {
    const x = left + (index / (histogram.length - 1)) * bandWidth;
    const y = height - (value / max) * (height - 12) - 4;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.lineWidth = 1.6;
  context.strokeStyle = color;
  context.shadowColor = color;
  context.shadowBlur = 5;
  context.stroke();
  context.shadowBlur = 0;
};

const drawGridMatrix = (context, grid, xOffset, bandWidth, height, color) => {
  const cols = grid?.length || 0;
  const firstBins = grid?.[0]?.bins || grid?.[0];
  const bins = firstBins?.length || 0;
  if (!cols || !bins) return;
  context.fillStyle = color;
  for (let c = 0; c < cols; c += 1) {
    const col = grid[c]?.bins || grid[c];
    if (!col) continue;
    for (let b = 0; b < bins; b += 1) {
      const intensity = col[b];
      if (intensity <= 0.01) continue;
      context.globalAlpha = Math.min(0.9, 0.14 + intensity * 0.85);
      const x = xOffset + (c / cols) * bandWidth;
      const y = (1 - (b + 1) / bins) * (height - 8) + 4;
      context.fillRect(x, y, Math.max(1.5, bandWidth / cols), Math.max(1.5, (height - 8) / bins));
    }
  }
  context.globalAlpha = 1;
};

const drawVectorscope = (context, scopes, width, height) => {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.42;

  context.strokeStyle = "rgba(148, 163, 184, 0.25)";
  context.lineWidth = 1;
  context.beginPath();
  context.arc(cx, cy, radius, 0, Math.PI * 2);
  context.stroke();

  // Rec.709 Skin-Tone I-line
  const skinRad = (SKIN_TONE_LINE_ANGLE_DEG * Math.PI) / 180;
  context.strokeStyle = "rgba(251, 191, 36, 0.65)";
  context.beginPath();
  context.moveTo(cx, cy);
  context.lineTo(cx + Math.cos(skinRad) * radius, cy - Math.sin(skinRad) * radius);
  context.stroke();

  const grid = scopes?.vectorscope?.grid || [];
  const bins = grid.length;
  context.fillStyle = "#38bdf8";
  for (let y = 0; y < bins; y += 1) {
    const row = grid[y] || [];
    for (let x = 0; x < row.length; x += 1) {
      const val = row[x];
      if (val <= 0.01) continue;
      const nx = (x / Math.max(1, bins - 1)) * 2 - 1;
      const ny = (y / Math.max(1, bins - 1)) * 2 - 1;
      context.globalAlpha = Math.min(0.95, 0.2 + val * 0.9);
      context.fillRect(cx + nx * radius, cy - ny * radius, 2.5, 2.5);
    }
  }
  context.globalAlpha = 1;
};

export default function VideoScopes({ videoRef, canvasRef, mode = "parade" }) {
  const outputRef = useRef(null);
  const sampleRef = useRef(null);
  const [status, setStatus] = useState("Waiting for frame");

  useEffect(() => {
    const output = outputRef.current;
    const sample = sampleRef.current;
    if (!output || !sample) return undefined;
    const outputContext = output.getContext?.("2d");
    const sampleContext = sample.getContext?.("2d", { willReadFrequently: true });
    if (!outputContext || !sampleContext) return undefined;
    let stopped = false;

    const renderScope = () => {
      if (stopped) return;
      const video = canvasRef?.current || videoRef?.current;
      outputContext.clearRect(0, 0, output.width, output.height);
      outputContext.fillStyle = "#050814";
      outputContext.fillRect(0, 0, output.width, output.height);
      outputContext.strokeStyle = "rgba(133, 159, 193, 0.13)";
      for (let index = 1; index < 4; index += 1) {
        const y = (index / 4) * output.height;
        outputContext.beginPath();
        outputContext.moveTo(0, y);
        outputContext.lineTo(output.width, y);
        outputContext.stroke();
      }

      if (!video || (video.tagName === "VIDEO" ? video.readyState < 2 || !video.videoWidth : !video.width)) {
        setStatus("Waiting for frame");
        return;
      }
      try {
        sampleContext.drawImage(video, 0, 0, sample.width, sample.height);
        const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
        if (mode === "luma") {
          const luma = Array(64).fill(0);
          for (let index = 0; index < pixels.length; index += 16) {
            const r = pixels[index];
            const g = pixels[index + 1];
            const b = pixels[index + 2];
            luma[Math.min(63, Math.round((r * 0.2126 + g * 0.7152 + b * 0.0722) / 4))] += 1;
          }
          drawHistogram(outputContext, luma, output.width, output.height, "#f5f7ff", 4, output.width - 8);
          setStatus("Luma histogram live");
          return;
        }
        const scopes = computeColorScopesFromRgba(pixels, sample.width, sample.height, {
          columns: 32,
          bins: 24,
          vectorBins: 24,
        });
        if (mode === "waveform") {
          drawGridMatrix(outputContext, scopes.waveform, 4, output.width - 8, output.height, "#e2e8f0");
          setStatus(
            `Waveform live · IRE ${scopes.lumaStats?.minLuma ?? 0}–${scopes.lumaStats?.maxLuma ?? 100}`
          );
        } else if (mode === "vectorscope") {
          drawVectorscope(outputContext, scopes, output.width, output.height);
          setStatus(
            `Vectorscope live · Skin ${scopes.vectorscope?.skinToneCompliancePct ?? "--"}%`
          );
        } else {
          const bandWidth = output.width / 3 - 8;
          drawGridMatrix(outputContext, scopes.parade?.r, 4, bandWidth, output.height, "#ff5c7a");
          drawGridMatrix(outputContext, scopes.parade?.g, output.width / 3 + 4, bandWidth, output.height, "#5fffa5");
          drawGridMatrix(outputContext, scopes.parade?.b, (2 * output.width) / 3 + 4, bandWidth, output.height, "#62b5ff");
          setStatus("RGB parade live");
        }
      } catch (_error) {
        setStatus("Scope unavailable for this source");
      }
    };

    renderScope();
    const interval = window.setInterval(renderScope, 180);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [mode, videoRef, canvasRef]);

  return (
    <div className="studio-video-scopes" data-testid="studio-video-scopes">
      <canvas ref={outputRef} width="300" height="96" aria-label={status} />
      <canvas ref={sampleRef} width="64" height="36" hidden />
      <span>{status}</span>
    </div>
  );
}
