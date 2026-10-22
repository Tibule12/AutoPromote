import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  createStudioVectorShape,
  studioVectorPoints,
  trimStudioVectorPoints,
  studioVectorSvg,
  validateStudioVectorTrim,
} from "../studioVectorShape";
import { buildMotionAutomationStyle } from "../studioAutomation";
import { studioMotionPropertiesForTarget } from "../studioMotionProperties";
import { retargetStudioKeyframes } from "../studioKeyframeSelection";
import {
  adaptStudioSnapshotToDocument,
  projectStudioEditableStateToSnapshot,
  validateStudioProjectDocument,
} from "../studioProjectDocument";
import { compileStudioCompositionForRender } from "../studioRenderCompiler";
import { MotionInspector } from "../StudioAdvancedInspectors";

const layer = () => ({
  id: "art",
  name: "Route",
  type: "image",
  vectorShape: createStudioVectorShape(),
  strokeStart: 10,
  strokeEnd: 90,
  startTime: 0,
  duration: 4,
  sourceStoragePath: "owned/art.png",
});
const keys = () =>
  [0, 4].map((time, i) => ({
    id: `end${i}`,
    targetId: "art",
    property: "strokeEnd",
    time,
    value: i * 100,
    easing: "linear",
  }));

test("trim follows distance across unequal segments and skips repeated points", () => {
  const points = [
    [0, 0],
    [0, 0],
    [90, 0],
    [90, 10],
  ];
  expect(trimStudioVectorPoints(points, 25, 95)).toEqual([
    [25, 0],
    [90, 0],
    [90, 5],
  ]);
  expect(trimStudioVectorPoints(points, 80, 20)).toEqual([]);
  expect(trimStudioVectorPoints(points, 50, 50)).toEqual([]);
  expect(
    trimStudioVectorPoints([
      [2, 2],
      [2, 2],
    ])
  ).toEqual([]);
  for (const bad of [NaN, -1, 101, true])
    expect(() => trimStudioVectorPoints(points, bad, 100)).toThrow();
});
test("partial outline keeps authored fill and full/empty paths have exact endpoints", () => {
  const shape = createStudioVectorShape();
  shape.stroke.width = 2;
  expect(studioVectorPoints(shape)).toHaveLength(769);
  const svg = studioVectorSvg(shape, { strokeStart: 10, strokeEnd: 65 });
  expect(svg).toContain('fill="url(#paint)"');
  expect(svg).toContain("<polyline");
  expect(studioVectorSvg(shape, { strokeStart: 80, strokeEnd: 20 })).not.toContain("<polyline");
  expect(studioVectorSvg(shape)).not.toContain("<polyline");
  shape.closed = false;
  expect(studioVectorPoints(shape).at(-1)).toEqual([35, 78]);
});
test("trim values, keys, canonical cold projection and native compiler preserve the same decisions", () => {
  const document = adaptStudioSnapshotToDocument({
    projectId: "trim",
    snapshot: {
      timeline: [{ id: "shot", sourceClipId: "source", startRequest: 0, endRequest: 4 }],
      overlays: [layer()],
      compositionOrder: ["art"],
      motionKeyframes: keys(),
    },
  });
  const saved = JSON.parse(JSON.stringify(document));
  const snapshot = projectStudioEditableStateToSnapshot(saved, {
    timeline: [{ id: "shot", sourceClipId: "source", url: "https://example.com/source.mp4" }],
  });
  expect(snapshot.overlays[0]).toMatchObject({ strokeStart: 10, strokeEnd: 90 });
  expect(
    buildMotionAutomationStyle(snapshot.motionKeyframes, 2, snapshot.overlays[0])
  ).toMatchObject({ strokeStart: 10, strokeEnd: 50 });
  const compiled = compileStudioCompositionForRender(saved).layers.find(l => l.id === "art");
  expect(compiled.base_transform).toMatchObject({ stroke_start: 10, stroke_end: 90 });
  expect(compiled.motion_keyframes.map(k => k.value)).toEqual([0, 100]);
  saved.linkedTiming.keys.motionKeyframes[1].parameters.value = 101;
  expect(() => validateStudioProjectDocument(saved)).toThrow("Vector");
});
test("only editable vector targets accept trim keys, including clipboard retargeting", () => {
  expect(studioMotionPropertiesForTarget(layer()).map(p => p.id)).toContain("strokeEnd");
  for (const target of [
    { id: "photo", type: "image" },
    { id: "main-video", type: "video" },
    { id: "title", type: "text" },
  ]) {
    expect(studioMotionPropertiesForTarget(target).map(p => p.id)).not.toContain("strokeEnd");
    expect(() => retargetStudioKeyframes(keys(), target)).toThrow("does not support");
    expect(() => validateStudioVectorTrim(target, keys())).toThrow("editable vector");
  }
  expect(retargetStudioKeyframes(keys(), { ...layer(), id: "other" })[0].targetId).toBe("other");
  expect(() => validateStudioVectorTrim({ ...layer(), strokeStart: Infinity })).toThrow();
  expect(() => validateStudioVectorTrim({ ...layer(), strokeEnd: true })).toThrow();
});
test("custom-curve overshoot is clamped at the paint consumer without altering authored keys", () => {
  const animation = keys();
  animation[1] = { ...animation[1], easing: "bezier", curve: [0.1, 2, 0.9, 2] };
  expect(buildMotionAutomationStyle(animation, 3, layer()).strokeEnd).toBe(100);
  expect(animation[1].curve[1]).toBe(2);
});
test("native inspector shows evaluated stroke values, precise key state and locked controls", () => {
  const onUpdateOverlay = jest.fn(),
    onTogglePropertyKeyframe = jest.fn();
  const props = {
    activeOverlay: layer(),
    overlays: [layer()],
    keyframes: keys(),
    playhead: 2,
    onUpdateOverlay,
    onTogglePropertyKeyframe,
    onSeek: jest.fn(),
    onSelectOverlay: jest.fn(),
  };
  const { rerender } = render(<MotionInspector {...props} />);
  expect(screen.getByLabelText("Stroke end").value).toBe("50");
  fireEvent.change(screen.getByLabelText("Stroke end"), { target: { value: "60" } });
  fireEvent.blur(screen.getByLabelText("Stroke end"));
  expect(onUpdateOverlay).toHaveBeenCalledWith("strokeEnd", 60);
  fireEvent.click(screen.getByLabelText("Add stroke end key at playhead"));
  expect(onTogglePropertyKeyframe).toHaveBeenCalledWith("strokeEnd");
  rerender(<MotionInspector {...props} playhead={4} keyframesLocked />);
  expect(screen.getByLabelText("Stroke end").disabled).toBe(true);
  expect(screen.getByLabelText("Remove stroke end key at playhead").disabled).toBe(true);
});
