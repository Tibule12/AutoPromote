import {
  VECTOR_SHAPE_PRIMITIVE_CATALOG,
  createStudioVectorShape,
  createStudioVectorPrimitive,
  addStudioVectorCounterHole,
  smoothStudioVectorContourNodes,
  scaleStudioVectorContour,
  studioVectorContour,
  replaceStudioVectorContour,
  validateStudioVectorShape,
  editStudioVectorNode,
  splitStudioVectorSegment,
  studioVectorSvg,
  studioVectorUri,
} from "../studioVectorShape";
import { getSafeMediaSource } from "../../utils/security";
import {
  adaptStudioSnapshotToDocument,
  projectStudioEditableStateToSnapshot,
  validateStudioProjectDocument,
} from "../studioProjectDocument";
import { compileStudioCompositionForRender } from "../studioRenderCompiler";

const cubic = (a, b, t) =>
  ["x", "y"].map(
    (axis, i) =>
      (1 - t) ** 3 * a[axis] +
      3 * (1 - t) ** 2 * t * (a[axis] + a.out[i]) +
      3 * (1 - t) * t * t * (b[axis] + b.in[i]) +
      t ** 3 * b[axis]
  );
test("splitting a curved contour preserves its exact geometry and independent tangent ownership", () => {
  const shape = createStudioVectorShape(),
    next = splitStudioVectorSegment(shape, 0);
  expect(next.nodes).toHaveLength(7);
  expect(shape.nodes).toHaveLength(6);
  for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    const expected = cubic(shape.nodes[0], shape.nodes[1], t),
      actual =
        t <= 0.5
          ? cubic(next.nodes[0], next.nodes[1], t * 2)
          : cubic(next.nodes[1], next.nodes[2], t * 2 - 1);
    actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i], 9));
  }
  const moved = editStudioVectorNode(next, 1, "anchor", [40, 40]);
  expect(moved.nodes[1]).toMatchObject({
    x: 40,
    y: 40,
    in: next.nodes[1].in,
    out: next.nodes[1].out,
  });
  expect(next.nodes[1].x).not.toBe(40);
});
test("contour decisions survive the ordinary canonical project, projection and render compiler", () => {
  const vectorShape = editStudioVectorNode(createStudioVectorShape(), 0, "out", [8, -50]);
  const doc = adaptStudioSnapshotToDocument({
    projectId: "vector",
    snapshot: {
      timeline: [{ id: "shot", sourceClipId: "source", startRequest: 0, endRequest: 4 }],
      overlays: [
        {
          id: "art",
          type: "image",
          vectorShape,
          src: "https://example.com/owned.png",
          sourceStoragePath: "owned/art.png",
          startTime: 0,
          duration: 4,
        },
      ],
      compositionOrder: ["art"],
      motionKeyframes: [
        { id: "x", targetId: "art", property: "x", time: 0, value: 50, easing: "linear" },
      ],
    },
  });
  const saved = JSON.parse(JSON.stringify(doc));
  expect(
    projectStudioEditableStateToSnapshot(saved, {
      timeline: [{ id: "shot", sourceClipId: "source", url: "https://example.com/source.mp4" }],
    }).overlays[0].vectorShape
  ).toEqual(vectorShape);
  expect(
    compileStudioCompositionForRender(saved).layers.find(l => l.id === "art").vector_shape
  ).toEqual(vectorShape);
  const layer = saved.layers.find(l => l.layerId === "art");
  layer.parameters.vectorShape.nodes[0].out[0] = Infinity;
  expect(() => validateStudioProjectDocument(saved)).toThrow("Vector");
});
test("vector geometry cannot carry external resources, unbounded numbers or executable SVG", () => {
  for (const change of [
    s => (s.nodes[0].in = [NaN, 0]),
    s => (s.nodes[0].x = true),
    s => (s.fill.color = "url(https://external)"),
    s => (s.href = "https://external"),
    s => (s.nodes[0].out = [201, 0]),
    s => (s.fill.end = [...s.fill.start]),
    s => (s.nodes = []),
  ]) {
    const shape = createStudioVectorShape();
    change(shape);
    expect(() => validateStudioVectorShape(shape)).toThrow();
  }
  const svg = studioVectorSvg(createStudioVectorShape());
  expect(svg).toContain("<path");
  expect(svg).toContain("linearGradient");
  expect(svg).not.toMatch(/script|href|foreignObject|image|filter/);
  expect(getSafeMediaSource(studioVectorUri(createStudioVectorShape()))).toBe(
    studioVectorUri(createStudioVectorShape())
  );
});

test("all 8 parametric vector primitives, compound counter holes, smoothing and scaling validate cleanly", () => {
  expect(VECTOR_SHAPE_PRIMITIVE_CATALOG).toHaveLength(8);
  for (const item of VECTOR_SHAPE_PRIMITIVE_CATALOG) {
    const primitive = createStudioVectorPrimitive(item.id);
    expect(() => validateStudioVectorShape(primitive)).not.toThrow();
    expect(studioVectorSvg(primitive)).toContain("<path");
  }

  const hex = createStudioVectorPrimitive("hexagon_shield");
  const withHole = addStudioVectorCounterHole(hex, { radius: 14, centerX: 50, centerY: 50 });
  expect(withHole.version).toBe(2);
  expect(withHole.contours).toHaveLength(2);
  expect(() => validateStudioVectorShape(withHole)).not.toThrow();

  const smoothed = replaceStudioVectorContour(
    withHole,
    0,
    smoothStudioVectorContourNodes(studioVectorContour(withHole, 0), 0.2)
  );
  expect(() => validateStudioVectorShape(smoothed)).not.toThrow();

  const inset = replaceStudioVectorContour(
    smoothed,
    0,
    scaleStudioVectorContour(studioVectorContour(smoothed, 0), 0.85)
  );
  expect(() => validateStudioVectorShape(inset)).not.toThrow();
});
