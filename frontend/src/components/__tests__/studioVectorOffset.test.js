import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  offsetStudioVectorPoints,
  createStudioVectorShape,
  studioVectorSvg,
  validateStudioVectorTrim,
} from "../studioVectorShape";
import { buildMotionAutomationStyle } from "../studioAutomation";
import {
  adaptStudioSnapshotToDocument,
  projectStudioEditableStateToSnapshot,
  validateStudioProjectDocument,
} from "../studioProjectDocument";
import { compileStudioCompositionForRender } from "../studioRenderCompiler";
import { retargetStudioKeyframes } from "../studioKeyframeSelection";
import { MotionInspector } from "../StudioAdvancedInspectors";

const square = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
  [0, 0],
];
const layer = () => ({
  id: "art",
  type: "image",
  vectorShape: createStudioVectorShape(),
  strokeStart: 0,
  strokeEnd: 25,
  strokeOffset: 60,
  startTime: 0,
  duration: 4,
  sourceStoragePath: "owned/art.png",
});
const keys = () =>
  [0, 4].map((time, i) => ({
    id: `offset${i}`,
    targetId: "art",
    property: "strokeOffset",
    time,
    value: i ? 300 : -100,
    easing: "linear",
  }));
test("closed offset crosses the original seam continuously, with signed and repeated loops", () => {
  const expected = [
    [0, 80],
    [0, 0],
    [40, 0],
  ];
  expect(offsetStudioVectorPoints(square, 0, 30, 80, true)).toEqual(expected);
  expect(offsetStudioVectorPoints(square, 0, 30, -20, true)).toEqual(expected);
  expect(offsetStudioVectorPoints(square, 0, 30, 280, true)).toEqual(expected);
  expect(offsetStudioVectorPoints(square, 0, 100, -950, true)).toBe(square);
  expect(offsetStudioVectorPoints(square, 50, 50, 80, true)).toEqual([]);
  expect(offsetStudioVectorPoints(square, 80, 20, 80, true)).toEqual([]);
});
test("open offset clips at both actual endpoints and never joins across them", () => {
  const points = [
    [0, 0],
    [100, 0],
  ];
  expect(offsetStudioVectorPoints(points, 0, 30, 80, false)).toEqual([
    [80, 0],
    [100, 0],
  ]);
  expect(offsetStudioVectorPoints(points, 0, 30, -20, false)).toEqual([
    [0, 0],
    [10, 0],
  ]);
  expect(offsetStudioVectorPoints(points, 0, 30, 100, false)).toEqual([]);
  expect(offsetStudioVectorPoints(points, 0, 100, 50, false)).toEqual([
    [50, 0],
    [100, 0],
  ]);
  for (const bad of [true, NaN, Infinity, 1001, -1001])
    expect(() => offsetStudioVectorPoints(points, 0, 30, bad, true)).toThrow();
});
test("zero offset preserves prior artwork, full closed outlines ignore offset and fills stay authored", () => {
  const shape = createStudioVectorShape();
  shape.stroke.width = 2;
  expect(studioVectorSvg(shape)).toBe(studioVectorSvg(shape, { strokeOffset: 700 }));
  const svg = studioVectorSvg(shape, { strokeStart: 0, strokeEnd: 25, strokeOffset: 90 });
  expect(svg).toContain('fill="url(#paint)"');
  expect(svg).toContain("<polyline");
  expect(
    studioVectorSvg(shape, { strokeStart: 25, strokeEnd: 25, strokeOffset: 90 })
  ).not.toContain("<polyline");
  shape.closed = false;
  expect(studioVectorSvg(shape, { strokeOffset: 50 })).toContain("<polyline");
});
test("canonical keys, static values, preview, compiler and clipboard preserve cumulative offset", () => {
  const doc = adaptStudioSnapshotToDocument({
    projectId: "offset",
    snapshot: {
      timeline: [{ id: "shot", sourceClipId: "source", startRequest: 0, endRequest: 4 }],
      overlays: [layer()],
      compositionOrder: ["art"],
      motionKeyframes: keys(),
    },
  });
  const saved = JSON.parse(JSON.stringify(doc));
  const snapshot = projectStudioEditableStateToSnapshot(saved, {
    timeline: [{ id: "shot", sourceClipId: "source", url: "https://example.com/source.mp4" }],
  });
  expect(snapshot.overlays[0].strokeOffset).toBe(60);
  expect(
    buildMotionAutomationStyle(snapshot.motionKeyframes, 2, snapshot.overlays[0]).strokeOffset
  ).toBe(100);
  const compiled = compileStudioCompositionForRender(saved).layers.find(l => l.id === "art");
  expect(compiled.base_transform.stroke_offset).toBe(60);
  expect(compiled.motion_keyframes.map(k => k.value)).toEqual([-100, 300]);
  expect(retargetStudioKeyframes(keys(), { ...layer(), id: "other" })[1].value).toBe(300);
  expect(() => retargetStudioKeyframes(keys(), { id: "photo", type: "image" })).toThrow(
    "does not support"
  );
  saved.linkedTiming.keys.motionKeyframes[0].parameters.value = -1001;
  expect(() => validateStudioProjectDocument(saved)).toThrow("Vector");
  expect(() => validateStudioVectorTrim({ type: "image", strokeOffset: 0 })).toThrow(
    "editable vector"
  );
});
test("native inspector binds evaluated offset and its key toggle, and prevents locked edits", () => {
  const onUpdateOverlay = jest.fn(),
    onTogglePropertyKeyframe = jest.fn();
  const props = {
    activeOverlay: layer(),
    overlays: [layer()],
    keyframes: keys(),
    playhead: 1,
    onUpdateOverlay,
    onTogglePropertyKeyframe,
    onSeek: jest.fn(),
  };
  const { rerender } = render(<MotionInspector {...props} />);
  const input = screen.getByLabelText("Stroke offset");
  expect(input.value).toBe("0");
  expect(input.min).toBe("-1000");
  expect(input.max).toBe("1000");
  fireEvent.change(input, { target: { value: "" } });
  expect(input.value).toBe("");
  expect(onUpdateOverlay).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "-80" } });
  expect(onUpdateOverlay).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(onUpdateOverlay).toHaveBeenCalledWith("strokeOffset", -80);
  fireEvent.click(screen.getByLabelText("Add stroke offset key at playhead"));
  expect(onTogglePropertyKeyframe).toHaveBeenCalledWith("strokeOffset");
  onUpdateOverlay.mockClear();
  fireEvent.change(input, { target: { value: "80" } });
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.blur(input);
  expect(onUpdateOverlay).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "-60" } });
  rerender(<MotionInspector {...props} playhead={2} />);
  fireEvent.blur(screen.getByLabelText("Stroke offset"));
  expect(onUpdateOverlay).not.toHaveBeenCalled();
  rerender(<MotionInspector {...props} playhead={4} keyframesLocked />);
  expect(screen.getByLabelText("Stroke offset").disabled).toBe(true);
  expect(screen.getByLabelText("Remove stroke offset key at playhead").disabled).toBe(true);
});
