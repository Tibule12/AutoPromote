import React, { useEffect, useRef } from "react";

const resizeCanvas = canvas => {
  const width = Math.max(1, Math.round(canvas.clientWidth || 540));
  const height = Math.max(1, Math.round(canvas.clientHeight || 960));
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const targetWidth = Math.round(width * ratio);
  const targetHeight = Math.round(height * ratio);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  return { width: targetWidth, height: targetHeight, ratio };
};

const rgba = (hex, alpha) => {
  const safeHex = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex.slice(1) : "72f7ff";
  const value = Number.parseInt(safeHex, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
};

export default function AudioReactiveVisualizer({
  enabled,
  mode = "wave",
  color = "#72f7ff",
  intensity = 0.75,
  position = "bottom",
  getAnalyser,
}) {
  const canvasRef = useRef(null);
  const getAnalyserRef = useRef(getAnalyser);
  getAnalyserRef.current = getAnalyser;

  useEffect(() => {
    if (!enabled || !canvasRef.current) return undefined;
    const canvas = canvasRef.current;
    const context = canvas.getContext?.("2d");
    if (!context) return undefined;

    const analyser = getAnalyserRef.current?.() || null;
    const frequencyData = new Uint8Array(analyser?.frequencyBinCount || 64);
    const waveformData = new Uint8Array(analyser?.fftSize || 128);
    let animationFrame = 0;

    const drawWave = (width, height, energy) => {
      analyser?.getByteTimeDomainData?.(waveformData);
      const baseY = position === "top" ? height * 0.18 : height * 0.82;
      const amplitude = height * (0.035 + energy * 0.085) * intensity;
      context.beginPath();
      for (let index = 0; index < waveformData.length; index += 1) {
        const x = (index / Math.max(1, waveformData.length - 1)) * width;
        const idle = Math.sin(index * 0.42 + performance.now() * 0.004) * 0.08;
        const sample = analyser ? waveformData[index] / 128 - 1 : idle;
        const y = baseY + sample * amplitude;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.lineWidth = Math.max(3, width * 0.006);
      context.strokeStyle = rgba(color, 0.92);
      context.shadowColor = rgba(color, 0.9);
      context.shadowBlur = Math.max(10, width * 0.025);
      context.stroke();
    };

    const drawBars = (width, height, energy) => {
      const count = 28;
      const gap = width * 0.006;
      const barWidth = Math.max(2, (width * 0.72 - gap * (count - 1)) / count);
      const startX = width * 0.14;
      const baseY = position === "top" ? height * 0.25 : height * 0.87;
      for (let index = 0; index < count; index += 1) {
        const sampleIndex = Math.floor((index / count) * Math.max(1, frequencyData.length * 0.42));
        const idle = 0.08 + Math.abs(Math.sin(index * 0.7 + performance.now() * 0.003)) * 0.05;
        const sample = analyser ? frequencyData[sampleIndex] / 255 : idle;
        const barHeight = height * (0.012 + sample * 0.12 * intensity + energy * 0.025);
        const x = startX + index * (barWidth + gap);
        const y = position === "top" ? baseY : baseY - barHeight;
        const gradient = context.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, rgba(color, 0.98));
        gradient.addColorStop(1, "rgba(139, 92, 246, 0.35)");
        context.fillStyle = gradient;
        context.shadowColor = rgba(color, 0.7);
        context.shadowBlur = Math.max(5, width * 0.012);
        context.fillRect(x, y, barWidth, barHeight);
      }
    };

    const drawRing = (width, height, energy) => {
      const centerX = width / 2;
      const centerY = position === "top" ? height * 0.24 : height * 0.76;
      const radius = Math.min(width, height) * (0.13 + energy * 0.018 * intensity);
      const segments = 72;
      context.beginPath();
      for (let index = 0; index <= segments; index += 1) {
        const angle = (index / segments) * Math.PI * 2 - Math.PI / 2;
        const sampleIndex = Math.floor((index / segments) * Math.max(1, frequencyData.length * 0.55));
        const idle = 0.04 + Math.abs(Math.sin(index * 0.4 + performance.now() * 0.002)) * 0.025;
        const sample = analyser ? frequencyData[sampleIndex] / 255 : idle;
        const reactiveRadius = radius + sample * radius * 0.34 * intensity;
        const x = centerX + Math.cos(angle) * reactiveRadius;
        const y = centerY + Math.sin(angle) * reactiveRadius;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.lineWidth = Math.max(3, width * 0.007);
      context.strokeStyle = rgba(color, 0.9);
      context.shadowColor = rgba(color, 0.95);
      context.shadowBlur = Math.max(12, width * 0.035);
      context.stroke();
    };

    const draw = () => {
      const { width, height } = resizeCanvas(canvas);
      context.clearRect(0, 0, width, height);
      analyser?.getByteFrequencyData?.(frequencyData);
      const energy = frequencyData.length
        ? frequencyData.slice(0, Math.min(18, frequencyData.length)).reduce((sum, item) => sum + item, 0) /
          Math.min(18, frequencyData.length) /
          255
        : 0;
      context.save();
      context.globalCompositeOperation = "screen";
      if (mode === "bars") drawBars(width, height, energy);
      else if (mode === "ring") drawRing(width, height, energy);
      else drawWave(width, height, energy);
      context.restore();
      animationFrame = window.requestAnimationFrame(draw);
    };

    draw();
    return () => window.cancelAnimationFrame(animationFrame);
  }, [color, enabled, intensity, mode, position]);

  if (!enabled) return null;
  return (
    <canvas
      ref={canvasRef}
      className={`studio-audio-visualizer is-${mode} is-${position}`}
      data-testid="studio-audio-visualizer"
      aria-label={`${mode} audio-reactive visualizer`}
    />
  );
}
