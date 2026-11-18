import React from "react";
import titleGlyphs from "./motion/titleGlyphs.v1.json";
import { layoutStudioAnimatedText, studioTextAnimatorPoses } from "./studioTextAnimator";

export default function StudioAnimatedText({ layer, programmeWidth, progress }) {
  const shadowId = React.useId().replace(/:/g, "_");
  try {
    const layout = layoutStudioAnimatedText(layer, programmeWidth);
    const poses = studioTextAnimatorPoses(layer.textAnimator, progress, layout);
    const font = titleGlyphs.weights[layer.fontWeight || 900];
    const glyphScale = 36 / font.unitsPerEm;
    const shadow = layer.shadow || "soft";
    const shades =
      shadow === "strong"
        ? [
            [4, 7, 0.95],
            [1, 1, 1],
          ]
        : [[3, 5, 0.72]];
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
        {shadow !== "none" ? (
          <defs>
            <filter
              id={shadowId}
              x="-100%"
              y="-200%"
              width="300%"
              height="500%"
              colorInterpolationFilters="sRGB"
            >
              {shades.map(([dy, blur, opacity], i) => (
                <React.Fragment key={i}>
                  <feGaussianBlur in="SourceAlpha" stdDeviation={blur} result={`blur${i}`} />
                  <feOffset in={`blur${i}`} dy={dy} result={`offset${i}`} />
                  <feFlood floodColor="black" floodOpacity={opacity} result={`ink${i}`} />
                  <feComposite
                    in={`ink${i}`}
                    in2={`offset${i}`}
                    operator="in"
                    result={`shade${i}`}
                  />
                </React.Fragment>
              ))}
              <feMerge>
                {shades.map((_, i) => (
                  <feMergeNode key={i} in={`shade${i}`} />
                ))}
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
        ) : null}
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
              <g filter={shadow === "none" ? undefined : `url(#${shadowId})`}>
                {unit.glyphs.map((glyph, j) => (
                  <path
                    key={j}
                    d={font.glyphs[glyph.char].path}
                    transform={`translate(${glyph.x} ${glyph.baseline}) scale(${glyphScale} ${-glyphScale})`}
                    fill={layer.color || "#ffffff"}
                    stroke={layer.strokeColor || "rgba(0,0,0,0.92)"}
                    strokeWidth={Number(layer.strokeWidth || 0) / glyphScale}
                    paintOrder="stroke fill"
                  />
                ))}
              </g>
            </g>
          );
        })}
      </svg>
    );
  } catch (error) {
    return <span role="alert">{error.message}</span>;
  }
}
