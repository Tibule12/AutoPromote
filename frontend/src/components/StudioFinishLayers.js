import React from "react";
import AudioReactiveVisualizer from "./AudioReactiveVisualizer";

export default function StudioFinishLayers({
  fx,
  edgeBlurStyle,
  vignetteStyle,
  overlayStyle,
  grainStyle,
  letterboxStyle,
  fadeStyle,
  visualizer,
  getAnalyser,
}) {
  const liveVignetteStyle =
    Number(fx.vignette || 0) > 0
      ? {
          ...(vignetteStyle || { position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }),
          background: `radial-gradient(ellipse at center, transparent ${Math.round(
            (1 - Number(fx.vignette || 0)) * 68
          )}%, rgba(0,0,0,${(Number(fx.vignette || 0) * 0.88).toFixed(2)}) 100%)`,
        }
      : null;
  const liveGrainStyle =
    Number(fx.filmGrain || 0) > 0 && grainStyle
      ? { ...grainStyle, opacity: Number(fx.filmGrain || 0) * 0.45 }
      : null;

  return (
    <div className="studio-finish-layer-stack" data-testid="studio-finish-layers" aria-hidden="true">
      {edgeBlurStyle ? <div style={edgeBlurStyle} /> : null}
      {liveVignetteStyle ? <div style={liveVignetteStyle} /> : null}
      {overlayStyle ? <div style={overlayStyle} /> : null}
      {liveGrainStyle ? <div style={liveGrainStyle} /> : null}
      {Number(fx.chromaticAberration || 0) > 0 ? (
        <div
          className="studio-chromatic-layer"
          style={{ "--chromatic-strength": Number(fx.chromaticAberration || 0) }}
        />
      ) : null}
      {Number(fx.vhsTracking || 0) > 0 ? (
        <div
          className="studio-vhs-layer"
          style={{ "--vhs-strength": Number(fx.vhsTracking || 0) }}
        />
      ) : null}
      {Number(fx.lightLeak || 0) > 0 ? (
        <div
          className="studio-light-leak-layer"
          style={{ "--light-leak-strength": Number(fx.lightLeak || 0) }}
        />
      ) : null}
      {letterboxStyle ? (
        <>
          <div style={letterboxStyle.top} />
          <div style={letterboxStyle.bottom} />
        </>
      ) : null}
      {fadeStyle ? <div style={fadeStyle} /> : null}
      <AudioReactiveVisualizer {...visualizer} getAnalyser={getAnalyser} />
    </div>
  );
}
