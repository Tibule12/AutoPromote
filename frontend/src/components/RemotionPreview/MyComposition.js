import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import React from "react";

export const MyComposition = ({ text, color, fontSize }) => {
  const { fps, durationInFrames, width, height } = useVideoConfig();

  const frame = 0; // useCurrentFrame() requires wrapping in <Player> context which we have

  // Simple "Pop-in" animation logic
  const scale = Math.min(1, frame / 10);

  return (
    <AbsoluteFill
      style={{ backgroundColor: "transparent", justifyContent: "center", alignItems: "center" }}
    >
      <div
        style={{
          fontSize: fontSize || 50,
          fontFamily: "Arial, sans-serif",
          textAlign: "center",
          color: color || "white",
          textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
          transform: `scale(${1})`, // Static for now, animation needs hooks
          padding: 20,
          background: "rgba(0,0,0,0.5)",
          borderRadius: 10,
        }}
      >
        {text || "Your Caption Here"}
      </div>
    </AbsoluteFill>
  );
};
