import {
  buildStudioLogoDesign,
  LOGO_DESIGN_DEFAULT,
  studioLogoMasterSvg,
} from "../studioLogoDesign";
import { buildStudioGraphicsPackage } from "../studioGraphicsPackage";
import {
  studioVectorPath,
  validateStudioVectorShape,
  studioVectorSvg,
  studioVectorContour,
  replaceStudioVectorContour,
  editStudioVectorNode,
} from "../studioVectorShape";
import {
  adaptStudioSnapshotToDocument,
  projectStudioEditableStateToSnapshot,
} from "../studioProjectDocument";
import { compileStudioCompositionForRender } from "../studioRenderCompiler";

test.each(["flow", "orbit", "facet"])(
  "%s materializes a grouped design with real editable glyph counters",
  family => {
    const d = buildStudioLogoDesign({ ...LOGO_DESIGN_DEFAULT, name: "APO", family });
    expect(d.groups[0].layerIds).toEqual(d.layers.map(l => l.id));
    const letter = d.layers.find(l => l.name.endsWith("letter O"));
    expect(letter.vectorShape.version).toBe(2);
    expect(letter.vectorShape.contours).toHaveLength(2);
    expect(studioVectorPath(letter.vectorShape).match(/M /g)).toHaveLength(2);
    expect(studioLogoMasterSvg(d.layers)).not.toMatch(/<text|<image|font-face/);
    d.layers.forEach(l => expect(validateStudioVectorShape(l.vectorShape)).toBe(l.vectorShape));
  }
);
test("editable design and motion survive ordinary import/compiler/project recovery", async () => {
  const input = buildStudioLogoDesign({ ...LOGO_DESIGN_DEFAULT, name: "APO" }, { animate: true });
  let seq = 0;
  const built = await buildStudioGraphicsPackage({
    input,
    overlays: [],
    keyframes: [],
    compounds: [],
    order: [],
    duration: 8,
    aspect: 16 / 9,
    createId: () => `logo-${++seq}`,
    rasterize: async () => new File(["png"], "logo.png", { type: "image/png" }),
    createUrl: () => `blob:logo-${seq}`,
  });
  expect(built.layers.every(l => l.type === "image" && l.vectorShape)).toBe(true);
  expect(built.keys).toHaveLength(built.layers.length * 8);
  const snapshot = {
    overlays: built.overlays.map(l => ({
      ...l,
      src: "https://example.com/owned.png",
      sourceStoragePath: "owned/logo.png",
    })),
    motionKeyframes: built.keyframes,
    compoundClips: built.compounds,
    compositionOrder: built.order,
    timeline: [{ id: "shot", sourceClipId: "source", startRequest: 0, endRequest: 8 }],
    trimStart: 0,
    trimEnd: 8,
  };
  const doc = adaptStudioSnapshotToDocument({ projectId: "logo-project", snapshot });
  const restored = projectStudioEditableStateToSnapshot(doc, {
    timeline: [{ id: "shot", sourceClipId: "source", url: "https://example.com/source.mp4" }],
  });
  expect(restored.overlays.map(l => l.vectorShape)).toEqual(built.layers.map(l => l.vectorShape));
  const plan = compileStudioCompositionForRender(doc);
  expect(plan.layers.filter(l => l.vector_shape)).toHaveLength(built.layers.length);
});
test("editing one inner contour preserves other glyph components", () => {
  const glyph = buildStudioLogoDesign({ ...LOGO_DESIGN_DEFAULT, name: "O" }).layers.at(
    -1
  ).vectorShape;
  const first = JSON.stringify(glyph.contours[0]);
  const contour = studioVectorContour(glyph, 1);
  const next = replaceStudioVectorContour(
    glyph,
    1,
    editStudioVectorNode(contour, 0, "anchor", [45, 50])
  );
  expect(JSON.stringify(next.contours[0])).toBe(first);
  expect(next.contours[1].nodes[0]).toMatchObject({ x: 45, y: 50 });
  expect(glyph).not.toEqual(next);
});
test("compound trim emits separate strokes without bridges", () => {
  const glyph = buildStudioLogoDesign({ ...LOGO_DESIGN_DEFAULT, name: "O" }).layers.at(
    -1
  ).vectorShape;
  glyph.stroke.width = 2;
  const svg = studioVectorSvg(glyph, { strokeStart: 10, strokeEnd: 70, strokeOffset: 25 });
  expect(svg.match(/<polyline/g)).toHaveLength(2);
  expect(svg).toContain('fill-rule="evenodd"');
});
test("portable colour and monochrome masters retain transparent holes and distinct gradient ids", () => {
  const d = buildStudioLogoDesign(LOGO_DESIGN_DEFAULT);
  const original = JSON.stringify(d);
  const svg = studioLogoMasterSvg(d.layers),
    light = studioLogoMasterSvg(d.layers, { variant: "light" }),
    dark = studioLogoMasterSvg(d.layers, { variant: "dark" });
  expect(svg).toContain("logo-paint-0");
  expect(svg).toContain("logo-paint-1");
  expect(light).toContain("#ffffff");
  expect(light).not.toContain("linearGradient");
  expect(dark).toContain("#111827");
  expect(JSON.stringify(d)).toBe(original);
});
test.each([
  { name: "👋" },
  { name: "" },
  { tracking: Infinity },
  { symbolSize: 0 },
  { primary: "red" },
  { family: "generated" },
  { weight: 400 },
])("invalid design fails before authoring: %j", bad =>
  expect(() => buildStudioLogoDesign({ ...LOGO_DESIGN_DEFAULT, ...bad })).toThrow()
);
test("masters reject masks instead of silently exporting a different design", () => {
  const d = buildStudioLogoDesign(LOGO_DESIGN_DEFAULT);
  d.layers[0].mask = { enabled: true };
  expect(() => studioLogoMasterSvg(d.layers)).toThrow(/mask/i);
});
