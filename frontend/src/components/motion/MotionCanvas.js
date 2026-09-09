import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motionPose, motionPrimitives } from "./motionModel";
import "./motion.css";

function FittedText({ primitive: p }) {
  const ref = useRef(null);
  const [length, setLength] = useState(undefined);
  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled || !ref.current?.getComputedTextLength) return;
      // Measure without the previous length adjustment after text changes.
      ref.current.removeAttribute("textLength");
      const natural = ref.current.getComputedTextLength();
      const fitted = natural > p.maxWidth ? p.maxWidth : undefined;
      if (fitted !== undefined) ref.current.setAttribute("textLength", String(fitted));
      setLength(fitted);
    };
    measure();
    document.fonts?.ready?.then(measure);
    return () => {
      cancelled = true;
    };
  }, [p.text, p.size, p.maxWidth]);
  return (
    <text
      ref={ref}
      x={p.x}
      y={p.y}
      fill={p.fill}
      fontSize={p.size}
      dominantBaseline="text-before-edge"
      fontFamily="StudioMotion, DejaVu Sans, sans-serif"
      fontWeight="bold"
      textLength={length}
      lengthAdjust="spacingAndGlyphs"
    >
      {p.text}
    </text>
  );
}

export default function MotionCanvas({ scenes, getTime, time = 0 }) {
  const root = useRef(null),
    clock = useRef(getTime);
  const [size, setSize] = useState({ w: 1000, h: 1778 });
  const [frame, setFrame] = useState(time);
  clock.current = getTime;
  useEffect(() => {
    setFrame(time);
  }, [time]);
  useEffect(() => {
    if (!scenes.length) return undefined;
    let raf,
      previous = -1;
    const update = () => {
      const now = clock.current?.() ?? time;
      // Quantize consistently to a 30fps timeline without a free-running CSS animation.
      const tick = Math.floor(now * 30) / 30;
      if (tick !== previous) {
        setFrame(tick);
        previous = tick;
      }
      const r = root.current?.getBoundingClientRect();
      if (r?.width && r?.height)
        setSize(old =>
          old.w === r.width && old.h === r.height ? old : { w: r.width, h: r.height }
        );
      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, [scenes.length, time]);
  if (!scenes.length) return null;
  const h = (1000 * size.h) / size.w;
  return (
    <svg
      ref={root}
      className="studio-motion-canvas"
      viewBox={`0 0 1000 ${h}`}
      aria-label="Motion graphics preview"
      data-testid="motion-preview"
      role="img"
    >
      {scenes.map(scene => {
        const pose = motionPose(scene, frame, size.w, size.h);
        if (!pose) return null;
        return (
          <g
            key={scene.id}
            data-motion-id={scene.id}
            opacity={pose.opacity}
            transform={`translate(${pose.x * 10} ${(pose.y * h) / 100}) rotate(${pose.rotation}) scale(${pose.scale * 1.35}) translate(-300 -130)`}
          >
            {motionPrimitives(scene, pose).map((p, i) =>
              p.kind === "text" ? (
                <FittedText key={i} primitive={p} />
              ) : p.kind === "circle" ? (
                <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.fill} />
              ) : (
                <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} fill={p.fill} />
              )
            )}
          </g>
        );
      })}
    </svg>
  );
}
