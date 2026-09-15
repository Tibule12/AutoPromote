import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import MotionPanel from "./MotionPanel";
import {
  MOTION_PRESETS,
  MOTION_SOUNDS,
  createMotion,
  cutMotion,
  motionCues,
  motionPose,
  normalizeMotion,
  motionPrimitives,
} from "./motionModel";
import { synthesizeEffect } from "./soundDesign";

test("new editorial titles have clear large type while old projects retain their card design", () => {
  const scene = { ...createMotion("title", 0, "editorial-title"), text: "WE'RE BACK." };
  expect(scene.design).toBe("editorial");
  const art = motionPrimitives(scene, motionPose(scene, 1));
  expect(art.filter(item => item.kind === "text").some(item => item.size >= 60)).toBe(true);
  expect(art.filter(item => item.kind === "rect").every(item => item.h <= 5)).toBe(true);
  expect(normalizeMotion({ preset: "title" }).design).toBe("card");
  expect(normalizeMotion(JSON.parse(JSON.stringify(scene))).design).toBe("editorial");
});

test("moving a scene moves its linked cue and cuts preserve relative cue placement", () => {
  const scene = { ...createMotion("title", 8, "a"), soundOffset: 0.4 };
  expect(motionCues([scene])[0].startTime).toBe(8.4);
  const cut = cutMotion([scene], 2, 5);
  expect(cut[0].startTime).toBe(5);
  expect(motionCues(cut)[0].startTime).toBeCloseTo(5.4);
  expect(cutMotion([scene], 7, 13)).toEqual([]);
  expect(motionCues([{ ...scene, sound: "none" }])).toEqual([]);
});

test("poses are seekable and independent of playback history", () => {
  const scene = normalizeMotion({
    preset: "title",
    startTime: 2,
    duration: 4,
    x: 20,
    endX: 80,
    easing: "linear",
  });
  expect(motionPose(scene, 1)).toBeNull();
  expect(motionPose(scene, 4).x).toBe(50);
  motionPose(scene, 5.9);
  expect(motionPose(scene, 4).x).toBe(50);
  expect(motionPose(scene, 6)).toBeNull();
});

test("moving brand honors creator-authored start and end placement", () => {
  const scene = normalizeMotion({
    preset: "watermark",
    duration: 4,
    x: 20,
    endX: 80,
    y: 84,
    endY: 72,
    scale: 0.8,
    endScale: 1,
    easing: "linear",
  });
  const start = motionPose(scene, 0.6, 1920, 1080);
  const end = motionPose(scene, 3.4, 1920, 1080);
  expect(end.x).toBeGreaterThan(start.x + 30);
  expect(end.y).toBeLessThan(start.y - 5);
  expect(end.scale).toBeGreaterThan(start.scale);
});

test.each([
  [1920, 1080],
  [1080, 1920],
  [1080, 1080],
  [2560, 1080],
])(
  "moving brand stays inside a %i by %i canvas through rotation and scale changes",
  (width, height) => {
    const scene = normalizeMotion({
      preset: "watermark",
      duration: 12,
      scale: 0.8,
      endScale: 1.4,
      rotation: -45,
      endRotation: 45,
    });
    for (let time = 0; time < 12; time += 0.1) {
      const pose = motionPose(scene, time, width, height);
      const angle = (pose.rotation * Math.PI) / 180;
      const scale = (pose.scale * 1.35 * width) / 1000;
      for (const x of [-180, 180]) {
        for (const y of [-38, 28]) {
          const px = (width * pose.x) / 100 + scale * (x * Math.cos(angle) - y * Math.sin(angle));
          const py = (height * pose.y) / 100 + scale * (x * Math.sin(angle) + y * Math.cos(angle));
          expect(px).toBeGreaterThanOrEqual(0);
          expect(px).toBeLessThanOrEqual(width);
          expect(py).toBeGreaterThanOrEqual(0);
          expect(py).toBeLessThanOrEqual(height);
        }
      }
    }
  }
);

test.each([
  [1920, 1080],
  [1080, 1920],
  [1080, 1080],
  [1080, 1350],
])("every motion card stays action-safe on a %i by %i canvas", (width, height) => {
  MOTION_PRESETS.filter(preset => preset.id !== "watermark").forEach(preset => {
    const scene = normalizeMotion({
      preset: preset.id,
      duration: 4,
      x: 5,
      y: 95,
      endX: 95,
      endY: 5,
      scale: 1.4,
      endScale: 1.4,
      rotation: -45,
      endRotation: 45,
    });
    for (let time = 0.1; time < 4; time += 0.1) {
      const pose = motionPose(scene, time, width, height);
      const angle = (pose.rotation * Math.PI) / 180;
      const scale = (pose.scale * 1.35 * width) / 1000;
      for (const x of [-300, 300]) {
        for (const y of [-130, 130]) {
          const px = (width * pose.x) / 100 + scale * (x * Math.cos(angle) - y * Math.sin(angle));
          const py = (height * pose.y) / 100 + scale * (x * Math.sin(angle) + y * Math.cos(angle));
          expect(px).toBeGreaterThanOrEqual(width * 0.039);
          expect(px).toBeLessThanOrEqual(width * 0.961);
          expect(py).toBeGreaterThanOrEqual(height * 0.039);
          expect(py).toBeLessThanOrEqual(height * 0.961);
        }
      }
    }
  });
});

test("sound synthesis is deterministic and fades end cleanly", () => {
  const effect = { tone: "impact", duration: 0.3, fadeIn: 0.02, fadeOut: 0.1 };
  const a = synthesizeEffect(effect, 8000),
    b = synthesizeEffect(effect, 8000);
  expect(a).toEqual(b);
  expect(Math.abs(a[0])).toBe(0);
  expect(Math.abs(a[a.length - 1])).toBeLessThan(0.001);
  expect(Math.max(...a)).toBeGreaterThan(0.1);
});

test("motion editing supports words, keyframes, independent duplicates, cue waveforms and removal", () => {
  const seek = jest.fn();
  let state;
  function Harness() {
    const [scenes, setScenes] = useState([]);
    state = scenes;
    return (
      <MotionPanel scenes={scenes} onChange={setScenes} playhead={2} duration={30} onSeek={seek} />
    );
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Add Impact title" }));
  fireEvent.change(screen.getByLabelText("Motion headline"), { target: { value: "THIS IS " } });
  expect(screen.getByLabelText("Motion headline")).toHaveValue("THIS IS ");
  fireEvent.change(screen.getByLabelText("End X"), { target: { value: "70" } });
  fireEvent.change(screen.getByLabelText("Motion start"), { target: { value: "5" } });
  expect(state[0].endX).toBe(70);
  expect(motionCues(state)[0].startTime).toBe(5);
  expect(screen.getByRole("img", { name: "Sound effect waveform" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Sound waveform position"), { target: { value: ".2" } });
  expect(seek).toHaveBeenLastCalledWith(5.2);
  fireEvent.click(screen.getByRole("button", { name: "Play motion + sound" }));
  expect(seek).toHaveBeenLastCalledWith(5, true);
  fireEvent.click(screen.getByRole("button", { name: "Duplicate scene" }));
  expect(state).toHaveLength(2);
  expect(state[0].id).not.toBe(state[1].id);
  expect(motionCues(state)[1].startTime).toBe(9);
  fireEvent.change(screen.getByLabelText("Motion sound"), { target: { value: "none" } });
  expect(motionCues(state)).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Remove scene" }));
  expect(state).toHaveLength(1);
});

test("every editable motion value updates the versioned scene contract", () => {
  let state;
  function Harness() {
    const [scenes, setScenes] = useState([createMotion("counter", 1, "counter-controls")]);
    state = scenes;
    return (
      <MotionPanel
        scenes={scenes}
        onChange={setScenes}
        playhead={2}
        duration={30}
        onSeek={jest.fn()}
        transcript={[{ id: "line-1", text: "Reviewed transcript wording" }]}
      />
    );
  }
  render(<Harness />);
  const change = (label, value) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  change("Motion headline", "A precise number");
  change("Motion supporting text", "Measured, not guessed");
  change("Motion transcript line", "0");
  change("Target number", "98765");
  change("Number prefix", "R");
  change("Motion start", "3.25");
  change("Motion duration", "5.5");
  change("Motion accent", "#123456");
  change("Motion opacity", "0.65");
  change("Start X", "22");
  change("Start Y", "76");
  change("End X", "68");
  change("End Y", "70");
  change("Start scale", "0.75");
  change("End scale", "1.1");
  change("Start rotation", "-12");
  change("End rotation", "9");
  for (const easing of ["smooth", "punch", "spring", "linear"]) change("Motion easing", easing);
  for (const sound of MOTION_SOUNDS) change("Motion sound", sound);
  change("Motion sound", "subdrop");
  change("Cue delay", "0.35");
  change("Cue volume", "0.4");
  expect(state[0]).toEqual(
    expect.objectContaining({
      text: "Reviewed transcript wording",
      secondary: "Measured, not guessed",
      value: 98765,
      prefix: "R",
      startTime: 3.25,
      duration: 5.5,
      color: "#123456",
      opacity: 0.65,
      x: 22,
      y: 76,
      endX: 68,
      endY: 70,
      scale: 0.75,
      endScale: 1.1,
      rotation: -12,
      endRotation: 9,
      easing: "linear",
      sound: "subdrop",
      soundOffset: 0.35,
      soundVolume: 0.4,
    })
  );
});

test("supports the cinematic AutoPromote ident plus viral motion presets", () => {
  const ident = createMotion("brand_reveal", 0, "m-ident");
  expect(ident).toEqual(expect.objectContaining({
    preset: "brand_reveal",
    text: "AutoPromote",
    secondary: "CREATE · AMPLIFY · DOMINATE",
    duration: 6,
    sound: "impact",
    canvasMode: "standalone",
    canvasColor: "#050713",
  }));
  const identArt = motionPrimitives(ident, motionPose(ident, 3.5));
  expect(identArt.some(p => p.kind === "stroke_circle")).toBe(true);
  expect(identArt.some(p => p.kind === "line")).toBe(true);
  expect(identArt.some(p => p.kind === "text" && p.text === "Promote")).toBe(true);

  const badge = createMotion("badge", 1, "m-badge");
  expect(badge.preset).toBe("badge");
  expect(badge.sound).toBe("pop");
  expect(badge.color).toBe("#f59e0b");
  const badgeArt = motionPrimitives(badge, motionPose(badge, 2));
  expect(badgeArt.length).toBeGreaterThan(0);

  const progress = createMotion("progress", 0, "m-progress");
  expect(progress.preset).toBe("progress");
  expect(progress.sound).toBe("sweep");
  const progressArt = motionPrimitives(progress, motionPose(progress, 2));
  expect(progressArt.some(p => p.kind === "text" && p.text.includes("%"))).toBe(true);

  const quote = createMotion("quote", 5, "m-quote");
  expect(quote.preset).toBe("quote");
  expect(quote.sound).toBe("pop");
  const quoteArt = motionPrimitives(quote, motionPose(quote, 7));
  expect(quoteArt.some(p => p.kind === "circle")).toBe(true);

  const cta = createMotion("cta", 10, "m-cta");
  expect(cta.preset).toBe("cta");
  expect(cta.sound).toBe("chime");
  const ctaArt = motionPrimitives(cta, motionPose(cta, 12));
  expect(ctaArt.some(p => p.kind === "circle")).toBe(true);
});

test("generateSmartMotionBeats auto-places hook, counter, and CTA from transcript", () => {
  const { generateSmartMotionBeats } = require("./motionModel");
  const transcript = [
    { start: 0.1, end: 2.5, text: "Stop scrolling right now" },
    { start: 3.0, end: 6.0, text: "We gained over 50,000 users this week" },
    { start: 7.0, end: 10.0, text: "How did we actually do it?" },
    { start: 11.0, end: 14.0, text: "Here is the entire system breakdown" },
  ];

  const generated = generateSmartMotionBeats({ transcript, duration: 20 });
  expect(generated.length).toBeGreaterThanOrEqual(3);

  // Hook badge at beginning
  const hook = generated.find(s => s.preset === "badge");
  expect(hook).toBeDefined();
  expect(hook.startTime).toBeCloseTo(0.2);

  // Counter reveal from 50,000
  const counter = generated.find(s => s.preset === "counter");
  expect(counter).toBeDefined();
  expect(counter.value).toBe(50000);

  // Outro CTA
  const cta = generated.find(s => s.preset === "cta");
  expect(cta).toBeDefined();
  expect(cta.startTime).toBeGreaterThanOrEqual(14);
});

test("MotionPanel supports category tabs and auto-generate beats trigger", () => {
  const onChange = jest.fn();
  const onAutoGenerate = jest.fn();
  const onSeek = jest.fn();

  render(
    <MotionPanel
      scenes={[]}
      onChange={onChange}
      playhead={1}
      duration={30}
      onSeek={onSeek}
      onAutoGenerateMotionBeats={onAutoGenerate}
    />
  );

  // Auto-generate button triggers callback
  const autoBtn = screen.getByRole("button", { name: "Auto-generate motion beats" });
  expect(autoBtn).toBeInTheDocument();
  fireEvent.click(autoBtn);
  expect(onAutoGenerate).toHaveBeenCalledTimes(1);

  // Category filter tabs
  expect(screen.getByRole("tab", { name: "All" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "Add Impact title" })).toBeInTheDocument();

  // Switch to "Hooks & Badges"
  fireEvent.click(screen.getByRole("tab", { name: "Hooks & Badges" }));
  expect(screen.getByRole("tab", { name: "Hooks & Badges" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "Add Viral hook badge" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add Impact title" })).not.toBeInTheDocument();

  // Adding a preset from filtered tab
  fireEvent.click(screen.getByRole("button", { name: "Add Viral hook badge" }));
  expect(onChange).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ preset: "badge" }),
    ])
  );
});
