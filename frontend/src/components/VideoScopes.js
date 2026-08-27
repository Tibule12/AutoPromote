import React, { useEffect, useRef, useState } from "react";

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
};

export default function VideoScopes({ videoRef, mode = "parade" }) {
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
      const video = videoRef?.current;
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

      if (!video || video.readyState < 2 || !video.videoWidth) {
        setStatus("Waiting for frame");
        return;
      }
      try {
        sampleContext.drawImage(video, 0, 0, sample.width, sample.height);
        const pixels = sampleContext.getImageData(0, 0, sample.width, sample.height).data;
        const red = Array(64).fill(0);
        const green = Array(64).fill(0);
        const blue = Array(64).fill(0);
        const luma = Array(64).fill(0);
        for (let index = 0; index < pixels.length; index += 16) {
          const r = pixels[index];
          const g = pixels[index + 1];
          const b = pixels[index + 2];
          red[Math.min(63, r >> 2)] += 1;
          green[Math.min(63, g >> 2)] += 1;
          blue[Math.min(63, b >> 2)] += 1;
          luma[Math.min(63, Math.round((r * 0.2126 + g * 0.7152 + b * 0.0722) / 4))] += 1;
        }
        if (mode === "luma") {
          drawHistogram(outputContext, luma, output.width, output.height, "#f5f7ff", 4, output.width - 8);
        } else {
          const bandWidth = output.width / 3 - 8;
          drawHistogram(outputContext, red, output.width, output.height, "#ff5c7a", 4, bandWidth);
          drawHistogram(outputContext, green, output.width, output.height, "#5fffa5", output.width / 3 + 4, bandWidth);
          drawHistogram(outputContext, blue, output.width, output.height, "#62b5ff", (output.width / 3) * 2 + 4, bandWidth);
        }
        setStatus(mode === "luma" ? "Luma histogram live" : "RGB parade live");
      } catch (_error) {
        setStatus("Scope unavailable for this source");
      }
    };

    renderScope();
    const interval = window.setInterval(renderScope, 240);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [mode, videoRef]);

  return (
    <div className="studio-video-scopes" data-testid="studio-video-scopes">
      <canvas ref={outputRef} width="300" height="96" aria-label={status} />
      <canvas ref={sampleRef} width="96" height="54" hidden />
      <span>{status}</span>
    </div>
  );
}
