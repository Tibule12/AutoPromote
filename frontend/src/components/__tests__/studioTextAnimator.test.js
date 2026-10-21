import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  TEXT_ANIMATOR_DEFAULT,
  layoutStudioAnimatedText,
  studioTextAnimatorPoses,
  validateStudioTextAnimation,
} from "../studioTextAnimator";
import { buildMotionAutomationStyle } from "../studioAutomation";
import {
  adaptStudioSnapshotToDocument,
  projectStudioEditableStateToSnapshot,
  validateStudioProjectDocument,
} from "../studioProjectDocument";
import { compileStudioCompositionForRender } from "../studioRenderCompiler";
import { retargetStudioKeyframes } from "../studioKeyframeSelection";
import StudioTextAnimatorPanel from "../StudioTextAnimatorPanel";
import StudioAnimatedText from "../StudioAnimatedText";
import workerParity from "./fixtures/textAnimatorParity.v1.json";

const title = () => ({
  id: "type",
  type: "text",
  text: "MAKE IT MOVE",
  width: 90,
  x: 50,
  y: 50,
  fontFamily: "Inter",
  fontWeight: 900,
  textAlign: "center",
  startTime: 0,
  duration: 4,
  textAnimator: { ...TEXT_ANIMATOR_DEFAULT },
  textProgress: 100,
});
const keys = () =>
  [0, 2, 4].map((time, i) => ({
    id: `key${i}`,
    targetId: "type",
    property: "textProgress",
    time,
    value: i === 1 ? 100 : 0,
    easing: "linear",
  }));
test.each(workerParity)(
  "worker/browser geometry and poses agree for $layer.fontWeight / $layer.textAnimator.order",
  fixture => {
    const layout = layoutStudioAnimatedText(fixture.layer, fixture.programmeWidth);
    expect(layout.width).toBe(fixture.layout.width);
    expect(layout.units).toEqual(fixture.layout.units);
    for (const observation of fixture.observations) {
      const poses = studioTextAnimatorPoses(
        fixture.layer.textAnimator,
        observation.progress,
        layout
      );
      poses.forEach((pose, i) =>
        Object.keys(pose).forEach(field =>
          expect(pose[field]).toBeCloseTo(observation.poses[i][field], 10)
        )
      );
    }
  }
);
test("title copy stays editable with shared wrapping, explicit glyph positions and word units", () => {
  const layer = title(),
    layout = layoutStudioAnimatedText(layer, 1280);
  expect(layout.units).toHaveLength(10);
  expect(layout.lines).toEqual(["MAKE IT MOVE"]);
  expect(layout.units[0].glyphs[0]).toMatchObject({ char: "M", baseline: 38.2 });
  const words = layoutStudioAnimatedText(
    { ...layer, textAnimator: { ...layer.textAnimator, unit: "word" } },
    1280
  );
  expect(words.units).toHaveLength(3);
  expect(words.glyphs).toEqual(layout.glyphs);
  const revised = layoutStudioAnimatedText({ ...layer, text: "Move\nwith purpose." }, 405);
  expect(revised.lines).toEqual(["Move", "with purpose."]);
});
test("all ordering modes share exact endpoints, rank ties and reversible progress without wall-clock state", () => {
  const layer = { ...title(), text: "ABCD" },
    layout = layoutStudioAnimatedText(layer, 1280);
  for (const order of ["forward", "reverse", "center_out", "edges_in"]) {
    const spec = { ...layer.textAnimator, order };
    expect(studioTextAnimatorPoses(spec, 0, layout).every(p => p.opacity === 0)).toBe(true);
    for (const p of studioTextAnimatorPoses(spec, 100, layout))
      expect(p).toEqual({ x: 0, y: 0, scale: 1, rotation: -0, opacity: 1 });
    expect(studioTextAnimatorPoses(spec, 50, layout)).toEqual(
      studioTextAnimatorPoses(spec, 50, layout)
    );
  }
  const center = studioTextAnimatorPoses(
    { ...layer.textAnimator, order: "center_out" },
    10,
    layout
  );
  expect(center[1].opacity).toBeGreaterThan(0);
  expect(center[0].opacity).toBe(0);
  const reverse = studioTextAnimatorPoses({ ...layer.textAnimator, order: "reverse" }, 10, layout);
  expect(reverse[3].opacity).toBeGreaterThan(0);
  expect(reverse[0].opacity).toBe(0);
});
test("selectors leave unselected letters settled, including crossed and empty ranges", () => {
  const layer = title(),
    layout = layoutStudioAnimatedText(layer, 1280);
  const partial = studioTextAnimatorPoses(
    { ...layer.textAnimator, rangeStart: 20, rangeEnd: 60 },
    0,
    layout
  );
  expect(partial.map(p => p.opacity)).toEqual([1, 1, 0, 0, 0, 0, 1, 1, 1, 1]);
  for (const [rangeStart, rangeEnd] of [
    [50, 50],
    [80, 20],
  ])
    expect(
      studioTextAnimatorPoses({ ...layer.textAnimator, rangeStart, rangeEnd }, 0, layout).every(
        p => p.scale === 1 && p.opacity === 1
      )
    ).toBe(true);
});
test("all settling curves affect geometry while alpha stays within its linear local window", () => {
  const layer = { ...title(), text: "A" },
    layout = layoutStudioAnimatedText(layer, 1280);
  const spec = { ...layer.textAnimator, fromScale: 0.2, fromX: 1, fromOpacity: 0 };
  const pose = easing => studioTextAnimatorPoses({ ...spec, easing }, 50, layout)[0];
  expect(pose("linear").scale).toBeCloseTo(0.6);
  expect(pose("ease_in_out").scale).toBeCloseTo(0.6);
  expect(pose("ease_out").scale).toBeCloseTo(0.9);
  expect(pose("back_out").scale).toBeGreaterThan(1);
  expect(pose("back_out").x).toBeLessThan(0);
  for (const easing of ["linear", "ease_in_out", "ease_out", "back_out"])
    expect(pose(easing).opacity).toBe(0.5);
  expect(
    studioTextAnimatorPoses({ ...spec, fromScale: 0, fromOpacity: 1 }, 0, layout)[0].scale
  ).toBe(0);
});
test("canonical recovery, output compiler and property clipboard preserve the animator and progress", () => {
  const document = adaptStudioSnapshotToDocument({
    projectId: "text-rig",
    snapshot: {
      timeline: [{ id: "shot", sourceClipId: "source", startRequest: 0, endRequest: 4 }],
      overlays: [title()],
      compositionOrder: ["type"],
      motionKeyframes: keys(),
    },
  });
  const stored = JSON.parse(JSON.stringify(document));
  const snapshot = projectStudioEditableStateToSnapshot(stored, {
    timeline: [{ id: "shot", sourceClipId: "source" }],
  });
  expect(snapshot.overlays[0].textAnimator).toEqual(TEXT_ANIMATOR_DEFAULT);
  expect(
    buildMotionAutomationStyle(snapshot.motionKeyframes, 3, snapshot.overlays[0]).textProgress
  ).toBe(50);
  const compiled = compileStudioCompositionForRender(stored).layers.find(l => l.id === "type");
  expect(compiled.text_animator).toEqual(TEXT_ANIMATOR_DEFAULT);
  expect(compiled.base_transform.text_progress).toBe(100);
  expect(compiled.motion_keyframes.map(k => k.value)).toEqual([0, 100, 0]);
  expect(retargetStudioKeyframes(keys(), { ...title(), id: "other" })).toHaveLength(3);
  expect(() => retargetStudioKeyframes(keys(), { id: "plain", type: "text" })).toThrow(
    "does not support"
  );
  stored.layers[0].parameters.textAnimator.stagger = 100;
  expect(() => validateStudioProjectDocument(stored)).toThrow("stagger");
});
test("unsupported fonts/copy and orphan, nonfinite or out-of-range keys fail before export", () => {
  for (const layer of [
    { ...title(), type: "image" },
    { ...title(), bRollMode: "fullscreen" },
    { ...title(), b_roll_mode: "fullscreen" },
    { ...title(), isRainbow: true },
    { ...title(), fontFamily: "Impact" },
    { ...title(), text: "Hello 👋" },
    { ...title(), textProgress: NaN },
    { ...title(), textAnimator: { ...TEXT_ANIMATOR_DEFAULT, fromX: true } },
  ])
    expect(() => validateStudioTextAnimation(layer)).toThrow();
  expect(() => validateStudioTextAnimation({ type: "text" }, keys())).toThrow("enabled");
  expect(() =>
    validateStudioTextAnimation(title(), [{ property: "textProgress", value: 101 }])
  ).toThrow("progress");
  expect(() =>
    validateStudioTextAnimation({ type: "text", text: "Existing 👋 title" })
  ).not.toThrow();
});
test("native controls create a rig, preserve settings, accept signed drafts and respect locks", () => {
  const onChange = jest.fn(),
    onBuild = jest.fn(),
    onDisable = jest.fn();
  const layer = title(),
    props = { layer, onChange, onBuild, onDisable };
  const { rerender } = render(<StudioTextAnimatorPanel {...props} />);
  fireEvent.change(screen.getByLabelText("Animate text by"), { target: { value: "word" } });
  expect(onChange).toHaveBeenLastCalledWith({ ...layer.textAnimator, unit: "word" });
  const input = screen.getByLabelText("Starting rotation");
  fireEvent.change(input, { target: { value: "-120" } });
  expect(onChange).toHaveBeenCalledTimes(1);
  fireEvent.blur(input);
  expect(onChange).toHaveBeenLastCalledWith({ ...layer.textAnimator, fromRotation: -120 });
  fireEvent.click(screen.getByText("Rebuild entrance keys"));
  expect(onBuild).toHaveBeenCalledWith(layer.textAnimator);
  fireEvent.click(screen.getByText("Remove text animator"));
  expect(onDisable).toHaveBeenCalledTimes(1);
  rerender(<StudioTextAnimatorPanel {...props} locked />);
  expect(screen.getByLabelText("Starting rotation")).toBeDisabled();
  fireEvent.click(screen.getByText("Rebuild entrance keys"));
  expect(onBuild).toHaveBeenCalledTimes(1);
});
test("native predictive output renders independent units and updates from key-driven progress", () => {
  const layer = title();
  const { container, rerender } = render(
    <StudioAnimatedText layer={layer} programmeWidth={1280} progress={0} />
  );
  expect(container.querySelectorAll("[data-text-unit]")).toHaveLength(10);
  expect(
    [...container.querySelectorAll("[data-text-unit]")].every(
      e => e.getAttribute("opacity") === "0"
    )
  ).toBe(true);
  rerender(
    <StudioAnimatedText layer={{ ...layer, text: "MOVE" }} programmeWidth={1280} progress={100} />
  );
  expect(container.querySelectorAll("[data-text-unit]")).toHaveLength(4);
  expect(
    [...container.querySelectorAll("[data-text-unit]")].every(
      e => e.getAttribute("opacity") === "1"
    )
  ).toBe(true);
});
