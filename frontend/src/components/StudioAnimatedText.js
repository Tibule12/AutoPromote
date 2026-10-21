import React from "react";
import { layoutStudioAnimatedText, studioTextAnimatorPoses } from "./studioTextAnimator";

export default function StudioAnimatedText({ layer, programmeWidth, progress }) {
  try {
    const layout = layoutStudioAnimatedText(layer, programmeWidth);
    const poses = studioTextAnimatorPoses(layer.textAnimator, progress, layout);
    return (
      <svg
        className="studio-animated-text"
        role="img"
        aria-label={layer.text}
        width={layout.width - 32}
        height={layout.height - 16}
        viewBox={`0 0 ${layout.width - 32} ${layout.height - 16}`}
        style={{ overflow: "visible", display: "block" }}
      >
        {layout.units.map((unit, index) => {
          const p = poses[index],
            cx = unit.x + unit.width / 2,
            cy = unit.y + 25.2;
          return (
            <g
              key={index}
              data-text-unit={index}
              opacity={p.opacity}
              transform={`translate(${cx + p.x} ${cy + p.y}) rotate(${p.rotation}) scale(${p.scale}) translate(${-cx} ${-cy})`}
            >
              {unit.glyphs.map((glyph, j) => (
                <text
                  key={j}
                  x={glyph.x}
                  y={glyph.baseline}
                  fill={layer.color || "#ffffff"}
                  style={{
                    fontKerning: "none",
                    fontVariantLigatures: "none",
                    fontSize: 36,
                    fontFamily: '"Studio Inter", sans-serif',
                    fontWeight: layer.fontWeight || 900,
                    paintOrder: "stroke fill",
                  }}
                >
                  {glyph.char}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    );
  } catch (error) {
    return <span role="alert">{error.message}</span>;
  }
}
