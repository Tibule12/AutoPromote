// useCinematicEffects.js
// Manages all cinematic effect state and computes real-time CSS styles.
// 100% frontend — no backend processing required.

import { useState, useMemo, useCallback, useEffect, useRef } from "react";

export const CINEMATIC_PRESETS = [
  {
    id: "podcast_pro",
    name: "Podcast Pro",
    icon: "🎙️",
    desc: "Warm, punchy, professional",
    brightness: 1.05,
    contrast: 1.2,
    saturation: 1.1,
    temperature: 0.12,
    vignette: 0.22,
    blur: 0,
    sharpness: 0.3,
    zoom: 1,
  },
  {
    id: "dark_interview",
    name: "Dark Interview",
    icon: "🎬",
    desc: "Moody, dramatic, cinematic",
    brightness: 0.85,
    contrast: 1.38,
    saturation: 0.88,
    temperature: -0.08,
    vignette: 0.52,
    blur: 0,
    sharpness: 0,
    zoom: 1,
  },
  {
    id: "warm_cinematic",
    name: "Warm Cinematic",
    icon: "🌅",
    desc: "Golden hour, rich tones",
    brightness: 1.0,
    contrast: 1.15,
    saturation: 1.22,
    temperature: 0.32,
    vignette: 0.35,
    blur: 0,
    sharpness: 0,
    zoom: 1,
  },
  {
    id: "viral_hc",
    name: "Viral High Contrast",
    icon: "⚡",
    desc: "Bold, punchy, thumb-stopping",
    brightness: 1.1,
    contrast: 1.65,
    saturation: 1.42,
    temperature: 0,
    vignette: 0.15,
    blur: 0,
    sharpness: 0.5,
    zoom: 1,
  },
  {
    id: "soft_talk",
    name: "Soft Talk",
    icon: "💬",
    desc: "Airy, soft, interview-friendly",
    brightness: 1.1,
    contrast: 0.92,
    saturation: 0.82,
    temperature: 0.18,
    vignette: 0.1,
    blur: 0,
    sharpness: 0,
    zoom: 1,
  },
];

const DEFAULT_FX = {
  preset: null,
  brightness: 1,
  contrast: 1,
  saturation: 1,
  temperature: 0, // -1 (cool) → 0 (neutral) → 1 (warm)
  sharpness: 0, // 0–1 (clarity boost via contrast)
  vignette: 0, // 0–1
  // Blur
  blur: 0, // 0–20px
  blurMode: "edge", // "edge" (depth-of-field) | "full" (whole video)
  blurStart: -1, // -1 = always active, ≥0 = timed (seconds)
  blurEnd: -1, // -1 = always active, ≥0 = timed (seconds)
  // Zoom
  zoom: 1, // 1–2×
  zoomAnchor: "center", // "center" | "left" | "right"
  // Overlays
  overlayType: "", // "" | "gradient-bottom" | "gradient-top" | "tint"
  overlayOpacity: 0.4,
  overlayColor: "#000000",
  // Film grain
  filmGrain: 0, // 0–1
  // Letterbox (cinematic bars)
  letterbox: 0, // 0–15 (% of height per bar)
  // Fade
  fadeIn: 0, // 0–3 seconds
  fadeOut: 0, // 0–3 seconds
};

export default function useCinematicEffects() {
  const [fx, setFx] = useState(DEFAULT_FX);
  const [showPanel, setShowPanel] = useState(false);
  // Track current playback time for timed blur + fades
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRefInternal = useRef(null);
  const rafRef = useRef(null);

  // Attach to a video element for timed effects
  const attachVideo = useCallback(videoEl => {
    videoRefInternal.current = videoEl;
  }, []);

  // Animation loop to track currentTime for timed effects
  useEffect(() => {
    const tick = () => {
      const v = videoRefInternal.current;
      if (v) {
        setCurrentTime(v.currentTime || 0);
        if (v.duration && Number.isFinite(v.duration)) setDuration(v.duration);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const applyPreset = preset => {
    setFx(prev => ({
      ...prev,
      preset: preset.id,
      brightness: preset.brightness,
      contrast: preset.contrast,
      saturation: preset.saturation,
      temperature: preset.temperature,
      vignette: preset.vignette,
      blur: preset.blur,
      sharpness: preset.sharpness,
      zoom: preset.zoom ?? prev.zoom,
    }));
  };

  const updateFx = (key, value) => {
    setFx(prev => ({
      ...prev,
      [key]: value,
      preset: key === "preset" ? value : null,
    }));
  };

  const resetFx = () => setFx(DEFAULT_FX);

  // Is blur active right now? (handles timed blur)
  const blurActiveNow = useMemo(() => {
    if (fx.blur <= 0) return false;
    const timed = fx.blurStart >= 0 && fx.blurEnd >= 0;
    if (!timed) return true;
    return currentTime >= fx.blurStart && currentTime <= fx.blurEnd;
  }, [fx.blur, fx.blurStart, fx.blurEnd, currentTime]);

  // Build CSS filter string (NO blur here — blur is handled via overlay)
  const cssFilter = useMemo(() => {
    const parts = [];

    if (fx.brightness !== 1) parts.push(`brightness(${fx.brightness.toFixed(3)})`);

    const effectiveContrast = fx.contrast * (1 + fx.sharpness * 0.22);
    if (effectiveContrast !== 1) parts.push(`contrast(${effectiveContrast.toFixed(3)})`);

    if (fx.saturation !== 1) parts.push(`saturate(${fx.saturation.toFixed(3)})`);

    if (fx.temperature > 0) {
      parts.push(`sepia(${(fx.temperature * 0.45).toFixed(3)})`);
      parts.push(`saturate(${(1 + fx.temperature * 0.18).toFixed(3)})`);
    } else if (fx.temperature < 0) {
      const coolAmt = Math.abs(fx.temperature);
      parts.push(`grayscale(${(coolAmt * 0.12).toFixed(3)})`);
      parts.push(`hue-rotate(${(coolAmt * -18).toFixed(1)}deg)`);
    }

    // Full-video blur (only when blurMode is "full")
    if (blurActiveNow && fx.blurMode === "full") {
      parts.push(`blur(${fx.blur}px)`);
    }

    return parts.join(" ");
  }, [
    fx.brightness,
    fx.contrast,
    fx.saturation,
    fx.temperature,
    fx.sharpness,
    fx.blur,
    fx.blurMode,
    blurActiveNow,
  ]);

  // Style applied directly to the video/canvas element
  const mediaStyle = useMemo(() => {
    const style = {};
    if (cssFilter) style.filter = cssFilter;
    if (fx.zoom !== 1) {
      style.transform = `scale(${fx.zoom})`;
      style.transformOrigin =
        fx.zoomAnchor === "left"
          ? "15% 50%"
          : fx.zoomAnchor === "right"
            ? "85% 50%"
            : "center center";
    }
    if (fx.zoom !== 1 || cssFilter) {
      style.transition = "transform 0.3s ease, filter 0.25s ease";
    }
    return style;
  }, [cssFilter, fx.zoom, fx.zoomAnchor]);

  // Edge-blur overlay (depth-of-field) — blurs edges, keeps center sharp
  const edgeBlurStyle = useMemo(() => {
    if (!blurActiveNow || fx.blurMode !== "edge") return null;
    const focusX = fx.zoomAnchor === "left" ? "38%" : fx.zoomAnchor === "right" ? "62%" : "50%";
    return {
      position: "absolute",
      inset: 0,
      backdropFilter: `blur(${fx.blur}px)`,
      WebkitBackdropFilter: `blur(${fx.blur}px)`,
      // Keep a much larger safe zone around the subject and push blur to the far edges.
      maskImage: `radial-gradient(ellipse 64% 82% at ${focusX} 50%, transparent 0 58%, rgba(0, 0, 0, 0.12) 72%, rgba(0, 0, 0, 0.72) 88%, black 100%)`,
      WebkitMaskImage: `radial-gradient(ellipse 64% 82% at ${focusX} 50%, transparent 0 58%, rgba(0, 0, 0, 0.12) 72%, rgba(0, 0, 0, 0.72) 88%, black 100%)`,
      pointerEvents: "none",
      zIndex: 1,
      opacity: 0.92,
      transition: "backdrop-filter 0.3s ease",
    };
  }, [blurActiveNow, fx.blur, fx.blurMode, fx.zoomAnchor]);

  // Vignette overlay
  const vignetteStyle = useMemo(() => {
    if (fx.vignette <= 0) return null;
    const strength = fx.vignette;
    const transparent = Math.round((1 - strength) * 68);
    return {
      position: "absolute",
      inset: 0,
      background: `radial-gradient(ellipse at center, transparent ${transparent}%, rgba(0,0,0,${(strength * 0.88).toFixed(2)}) 100%)`,
      pointerEvents: "none",
      zIndex: 2,
    };
  }, [fx.vignette]);

  // Color overlay
  const overlayStyle = useMemo(() => {
    if (!fx.overlayType) return null;
    const base = {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 3,
    };
    const alphaHex = Math.round(fx.overlayOpacity * 255)
      .toString(16)
      .padStart(2, "0");
    if (fx.overlayType === "gradient-bottom") {
      return {
        ...base,
        background: `linear-gradient(to top, ${fx.overlayColor}${alphaHex} 0%, transparent 65%)`,
      };
    }
    if (fx.overlayType === "gradient-top") {
      return {
        ...base,
        background: `linear-gradient(to bottom, ${fx.overlayColor}${alphaHex} 0%, transparent 65%)`,
      };
    }
    if (fx.overlayType === "tint") {
      return { ...base, background: fx.overlayColor, opacity: fx.overlayOpacity };
    }
    return null;
  }, [fx.overlayType, fx.overlayColor, fx.overlayOpacity]);

  // Film grain overlay
  const grainStyle = useMemo(() => {
    if (fx.filmGrain <= 0) return null;
    return {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 4,
      opacity: fx.filmGrain * 0.45,
      mixBlendMode: "overlay",
      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      backgroundSize: "128px 128px",
      animation: "cep-grain-drift 0.6s steps(4) infinite",
    };
  }, [fx.filmGrain]);

  // Letterbox (cinematic bars)
  const letterboxStyle = useMemo(() => {
    if (fx.letterbox <= 0) return null;
    const barH = `${fx.letterbox}%`;
    return {
      top: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: barH,
        background: "#000",
        pointerEvents: "none",
        zIndex: 5,
        transition: "height 0.3s ease",
      },
      bottom: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: barH,
        background: "#000",
        pointerEvents: "none",
        zIndex: 5,
        transition: "height 0.3s ease",
      },
    };
  }, [fx.letterbox]);

  // Fade in/out overlay
  const fadeStyle = useMemo(() => {
    if (fx.fadeIn <= 0 && fx.fadeOut <= 0) return null;
    let opacity = 0;
    if (fx.fadeIn > 0 && currentTime < fx.fadeIn) {
      opacity = Math.max(opacity, 1 - currentTime / fx.fadeIn);
    }
    if (fx.fadeOut > 0 && duration > 0 && currentTime > duration - fx.fadeOut) {
      opacity = Math.max(opacity, (currentTime - (duration - fx.fadeOut)) / fx.fadeOut);
    }
    if (opacity <= 0) return null;
    return {
      position: "absolute",
      inset: 0,
      background: "#000",
      opacity: Math.min(1, opacity),
      pointerEvents: "none",
      zIndex: 10,
      transition: "opacity 0.1s linear",
    };
  }, [fx.fadeIn, fx.fadeOut, currentTime, duration]);

  const hasEffects = useMemo(
    () =>
      fx.brightness !== 1 ||
      fx.contrast !== 1 ||
      fx.saturation !== 1 ||
      fx.temperature !== 0 ||
      fx.blur > 0 ||
      fx.vignette > 0 ||
      fx.zoom > 1 ||
      !!fx.overlayType ||
      fx.sharpness > 0 ||
      fx.filmGrain > 0 ||
      fx.letterbox > 0 ||
      fx.fadeIn > 0 ||
      fx.fadeOut > 0,
    [fx]
  );

  return {
    fx,
    showPanel,
    setShowPanel,
    applyPreset,
    updateFx,
    resetFx,
    mediaStyle,
    edgeBlurStyle,
    vignetteStyle,
    overlayStyle,
    grainStyle,
    letterboxStyle,
    fadeStyle,
    hasEffects,
    cssFilter,
    attachVideo,
  };
}
