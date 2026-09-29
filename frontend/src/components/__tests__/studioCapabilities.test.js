import fs from "fs";
import path from "path";
import {
  getStudioCapability,
  isStudioCapabilityExecutable,
  STUDIO_CAPABILITIES,
  STUDIO_CAPABILITY_REGISTRY_VERSION,
} from "../studioCapabilities";
import { createStudio3DScene, normalizeStudio3DScene, studio3DPose } from "../threeD/studio3DModel";
import { STUDIO_3D_FIELD_PARITY, getStudio3DFieldParity } from "../threeD/studio3DParity";
import poseFixture from "../threeD/fixtures/pose-parity-v1.json";

test("registry has unique versioned entries with traceable execution evidence", () => {
  expect(STUDIO_CAPABILITY_REGISTRY_VERSION).toBe(2);
  expect(new Set(STUDIO_CAPABILITIES.map(item => item.id)).size).toBe(STUDIO_CAPABILITIES.length);
  for (const item of STUDIO_CAPABILITIES) {
    expect(item).toMatchObject({
      version: expect.any(Number),
      parameterSchema: { type: "object", additionalProperties: false },
      requiredEvidence: expect.any(Array),
      readSet: expect.any(Array),
      writeSet: expect.any(Array),
      previewEngine: expect.any(String),
      previewFidelity: expect.any(String),
      costClass: expect.any(String),
      resourceClass: expect.any(String),
      releaseState: expect.any(String),
      limits: expect.any(Object),
      compatibility: expect.any(Array),
      conflicts: expect.any(Array),
      evidenceSuite: expect.any(Array),
    });
    expect(item.evidenceSuite.length).toBeGreaterThan(0);
    for (const evidencePath of item.evidenceSuite) {
      expect(fs.existsSync(path.resolve(process.cwd(), "..", evidencePath))).toBe(true);
    }
    expect(["exact", "approximate", "unsupported"]).toContain(item.supportStatus);
    expect(getStudioCapability(item.id)).toBe(item);
    if (
      item.supportStatus === "unsupported" ||
      ["blocked", "unverified"].includes(item.releaseState)
    ) {
      expect(item.executable).toBe(false);
    }
  }
  expect(getStudioCapability("not_a_capability")).toBeNull();
  expect(isStudioCapabilityExecutable("not_a_capability")).toBe(false);
  expect(Object.isFrozen(getStudioCapability("split_clip").parameterSchema.properties.at)).toBe(
    true
  );
});

test("migrated command family advertises exact source/programme targeting and preserve locks", () => {
  for (const operation of ["split_clip", "trim_clip", "preserve_range"]) {
    const capability = getStudioCapability(operation);
    expect(capability.operationType).toBe(operation);
    expect(capability.releaseState).toBe("foundation");
    expect(isStudioCapabilityExecutable(operation)).toBe(true);
    expect(capability.parameterSchema.properties.target.properties.occurrenceId).toBeDefined();
    expect(capability.limits.commandKernelMigrated).toBe(true);
  }
  expect(
    getStudioCapability("split_clip").parameterSchema.properties.at.properties.space.enum
  ).toEqual(["source", "programme", "clip_local", "output"]);
  expect(
    getStudioCapability("trim_clip").parameterSchema.properties.keep.properties.space.const
  ).toBe("source");
  expect(getStudioCapability("trim_clip")).toMatchObject({
    version: 2,
    limits: { humanUiRouted: true, humanUiRoute: "trim_start_only" },
  });
  expect(getStudioCapability("trim_clip").writeSet).toEqual(expect.arrayContaining([
    "layers", "linkedTiming", "speedKeyframes",
  ]));
  expect(getStudioCapability("preserve_range").writeSet).toContain("locks");
});

test("3D renderer cannot be advertised as a production GPU, native 1080p or universal layer service", () => {
  const scene = getStudioCapability("three_d_scene");
  expect(scene.executable).toBe(false);
  expect(scene.releaseState).toBe("unverified");
  expect(scene.limits).toMatchObject({
    maxPixels: 1280 * 720,
    native1080p: false,
    native4k: false,
    gpuAccelerationProven: false,
  });
  expect(scene.unsupportedSceneFields).toContain("audioReactiveIntensity");
  expect(scene.unsupportedSceneModes.exit).toContain("fade");
  expect(scene.compatibility).toContain("3D layerOrder sorts only 3D scenes");
  expect(isStudioCapabilityExecutable("three_d_audio_reactivity")).toBe(false);
});

test("every normalized 3D scene field has an explicit parity classification", () => {
  const scene = normalizeStudio3DScene(createStudio3DScene("neon_logo", 1, "parity"));
  expect(Object.keys(STUDIO_3D_FIELD_PARITY).sort()).toEqual(
    [...Object.keys(scene), "renderedOpacity"].sort()
  );
  for (const parity of Object.values(STUDIO_3D_FIELD_PARITY)) {
    expect(["exact", "approximate", "unsupported"]).toContain(parity.status);
    expect(parity.reason.length).toBeGreaterThan(12);
  }
  for (const field of [
    "audioReactiveIntensity",
    "fontFamily",
    "fontWeight",
    "lightDirection",
    "quality",
    "background",
    "shadows",
    "reflections",
    "renderedOpacity",
  ]) {
    expect(getStudio3DFieldParity(field).status).toBe("unsupported");
  }
  expect(getStudio3DFieldParity("layerOrder").status).toBe("approximate");
  expect(getStudio3DFieldParity("unknown")).toBeNull();
});

test("Three.js pose follows the paired Blender pose fixture", () => {
  const scene = normalizeStudio3DScene(poseFixture.scene);
  for (const sample of poseFixture.samples) {
    const actual = studio3DPose(scene, sample.time);
    for (const [key, expected] of Object.entries(sample.pose)) {
      expect(actual[key]).toBeCloseTo(expected, 10);
    }
  }
});
