// Backend boundary tests for the isolated Studio 3D GPU renderer.
const admin = require("firebase-admin");
const { validateStudio3DScene, stableSceneHash, resolveStudio3DExport } = require("../src/services/studio3DService");

const scene = () => ({
  version: 1, id: "studio-3d-demo", template: "neon_logo", name: "Logo reveal", text: "AutoPromote", secondary: "CREATE WHAT MOVES PEOPLE",
  startTime: 3, duration: 5, endTime: 8, layerOrder: 50, assetUrl: "", assetStoragePath: "", assetName: "",
  fontFamily: "studio", fontWeight: "bold", textAlign: "center", lineSpacing: 1, material: "neon", primaryColor: "#a855f7", secondaryColor: "#e8ecff", glowColor: "#a855f7", extrusionDepth: .28, bevel: .04,
  x: 50, y: 50, z: 0, scale: 1, rotationX: 0, rotationY: 0, rotationZ: 0, entrance: "orbit", hold: "float", exit: "fade", easing: "ease_out", intensity: .65, audioReactiveIntensity: 0,
  cameraMotion: .28, focalLength: 50, lightDirection: 35, lightColor: "#ffffff", lightIntensity: 2.2, shadows: true, reflections: true, bloom: .7, background: "transparent", enabled: true,
  quality: "preview", hqPreviewUrl: "", hqPreviewRevision: "", keyframes: [],
});

test.each(["cinematic_title", "neon_logo", "chrome_lyric", "audio_reactive_text", "floating_callout", "impact_explosion", "speaker_intro", "comparison_card"])("accepts bounded %s", template => {
  expect(validateStudio3DScene({ ...scene(), template }, "qa_user_123").template).toBe(template);
});

test.each([
  ["template", "../evil.py"], ["text", "bad\ncommand"], ["material", "$(touch /tmp/pwned)"],
  ["assetStoragePath", "../../secret"], ["assetStoragePath", "uploads/images/another_user/logo.png"],
  ["assetStoragePath", "uploads/images/qa_user_123/../secret.png"], ["primaryColor", "red; rm -rf /"],
  ["duration", NaN], ["endTime", 9], ["shadows", "false"],
])("rejects unsafe %s", (field, value) => {
  expect(() => validateStudio3DScene({ ...scene(), [field]: value }, "qa_user_123")).toThrow();
});

test("rejects unknown script fields and browser-only assets", () => {
  expect(() => validateStudio3DScene({ ...scene(), script: "import os" }, "qa_user_123")).toThrow();
  expect(() => validateStudio3DScene({ ...scene(), assetUrl: "blob:local" }, "qa_user_123")).toThrow();
});

test("accepts bounded pose keyframes and rejects extra executable fields", () => {
  const frame = { id: "pose-1", time: 4, easing: "spring", values: {
    x: 58, y: 45, z: .2, scale: 1.1, rotationX: 0, rotationY: 18, rotationZ: -4,
  } };
  expect(validateStudio3DScene({ ...scene(), keyframes: [frame] }, "qa_user_123").keyframes).toHaveLength(1);
  expect(() => validateStudio3DScene({ ...scene(), keyframes: [{ ...frame, command: "$(touch /tmp/pwned)" }] }, "qa_user_123")).toThrow();
});

test("hash ignores signed preview URLs but tracks authored values", () => {
  const original = scene();
  expect(stableSceneHash(original)).toBe(stableSceneHash({ ...original, hqPreviewUrl: "https://private.example/temporary" }));
  expect(stableSceneHash(original)).not.toBe(stableSceneHash({ ...original, text: "Changed" }));
});

describe("3D export ownership boundary", () => {
  let firestoreSpy;
  let storageSpy;
  const jobId = "12345678-job";
  const item = () => ({ jobId, scene: scene(), aspect: "9:16" });
  const job = () => ({ ownerUid: "qa_user_123", status: "completed", hash: stableSceneHash(validateStudio3DScene(scene(), "qa_user_123")), spec: { duration: 5, width: 720, height: 1280 }, overlayPath: `temp_studio_3d/qa_user_123/${jobId}/overlay.mov` });

  beforeEach(() => {
    process.env.STUDIO_3D_BUCKET = "autopromote-cc6d3-viral-studio-3d";
    firestoreSpy = jest.spyOn(admin, "firestore").mockImplementation(() => ({ collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => job() }) }) }) }));
    storageSpy = jest.spyOn(admin, "storage").mockImplementation(() => ({ bucket: () => ({ file: () => ({ getMetadata: async () => [{ size: "5000", contentType: "video/quicktime" }], getSignedUrl: async () => ["https://storage.googleapis.com/private-bucket/temp_studio_3d/qa_user_123/12345678-job/overlay.mov?X-Goog-Signature=abc"] }) }) }));
  });

  afterEach(() => {
    firestoreSpy.mockRestore();
    storageSpy.mockRestore();
    delete process.env.STUDIO_3D_BUCKET;
  });

  test("resolves only a matching completed owned render", async () => {
    const result = await resolveStudio3DExport({ ownerUid: "qa_user_123", items: [item()] });
    expect(result[0]).toMatchObject({ jobId, ownerUid: "qa_user_123", duration: 5 });
    expect(result[0].overlayUrl).toContain("storage.googleapis.com");
  });

  test("rejects someone else's job and stale scene edits", async () => {
    await expect(resolveStudio3DExport({ ownerUid: "another_user", items: [item()] })).rejects.toThrow();
    await expect(resolveStudio3DExport({ ownerUid: "qa_user_123", items: [{ ...item(), scene: { ...scene(), text: "Changed" } }] })).rejects.toThrow("stale");
  });

  test("rejects forged URL fields and mismatched aspect", async () => {
    await expect(resolveStudio3DExport({ ownerUid: "qa_user_123", items: [{ ...item(), overlayUrl: "http://127.0.0.1" }] })).rejects.toThrow();
    await expect(resolveStudio3DExport({ ownerUid: "qa_user_123", items: [{ ...item(), aspect: "16:9" }] })).rejects.toThrow("aspect ratio");
  });
});
