const crypto = require("crypto");
jest.mock("axios", () => ({ post: jest.fn(), get: jest.fn(), delete: jest.fn() }));
jest.mock("firebase-admin", () => ({ firestore: jest.fn(), storage: jest.fn() }));
jest.mock('../src/services/studioModelCapabilityService',()=>({resolveSubjectMaskInputs:jest.fn()}));
const admin = require("firebase-admin"),
  axios = require("axios");
const {
  createSubjectVfxPreview,
  getSubjectVfxPreview,
  cancelSubjectVfxPreview,
  resolveSubjectVfxExport,
} = require("../src/services/studioSubjectVfxService");
const scene = () => ({
  version: 1,
  id: "scene-1",
  sourceId: "source-a",
  sourceStoragePath: "studio/sources/owner/a.mp4",
  sourceRange: { start: 2, end: 8 },
  prompt: { points: [[0.5, 0.3]], labels: [1], shotPrompts: [] },
  effects: [
    {
      id: "title",
      type: "text_behind",
      start: 0,
      end: 6,
      text: "STORY",
      x: 50,
      y: 45,
      font_size: 100,
      color: "#f5f1ed",
    },
  ],
});
const ownerUid = "owner",
  bytes = Buffer.from("private rendered media test fixture"),
  sha = value => crypto.createHash("sha256").update(value).digest("hex");
let documents, objects, saves;
const job = jobId => documents.get(`studio_subject_vfx_jobs/${jobId}`);
const ref = key => ({
  key,
  get: async () => ({ exists: documents.has(key), data: () => documents.get(key) }),
  update: async data => documents.set(key, { ...documents.get(key), ...data }),
});
const file = path => ({
  getMetadata: async () => [objects.get(path)],
  getSignedUrl: async () => [
    `https://storage.googleapis.com/test-bucket/${path}?X-Goog-Signature=fixture`,
  ],
  save: async (content, options) => {
    saves.push(path);
    objects.set(path, { size: String(content.length), ...options.metadata });
  },
});
const receipt = jobId => ({
  requestHash: job(jobId).requestHash,
  encoder: "h264_nvenc",
  seconds: 6,
  frames: 144,
  output_sha256: sha(bytes),
  pixel_sha256: "a".repeat(64),
  original_source_sha256: "b".repeat(64),
});
async function create(clientRequestId = "test-request-123") {
  axios.post.mockImplementation(async (_url, spec) => ({ data: { jobId: spec.jobId } }));
  return createSubjectVfxPreview({ ownerUid, scene: scene(), clientRequestId });
}
async function finish(jobId, override = {}) {
  axios.get.mockImplementation(async url =>
    url.endsWith("/media")
      ? { data: bytes }
      : {
          data: {
            jobId,
            ownerUid,
            requestHash: job(jobId).requestHash,
            status: "completed",
            receipt: { ...receipt(jobId), ...override },
          },
        }
  );
  return getSubjectVfxPreview({ ownerUid, jobId });
}
const exportItems = jobId => ({
  ownerUid,
  items: [{ jobId, scene: scene() }],
  timeline: [
    {
      source_clip_id: "source-a",
      sourceStoragePath: scene().sourceStoragePath,
      start_time: 2,
      end_time: 5,
    },
    {
      source_clip_id: "source-a",
      sourceStoragePath: scene().sourceStoragePath,
      start_time: 5,
      end_time: 8,
    },
  ],
});

beforeEach(() => {
  jest.clearAllMocks();
  documents = new Map();
  objects = new Map();
  saves = [];
  objects.set(scene().sourceStoragePath, {
    generation: "123",
    size: "1024",
    contentType: "video/mp4",
    metadata: { ownerUid, purpose: "studio_source" },
  });
  admin.storage.mockReturnValue({ bucket: () => ({ file }) });
  admin.firestore.mockReturnValue({
    collection: name => ({ doc: id => ref(`${name}/${id}`) }),
    runTransaction: async action =>
      action({
        get: ref => ref.get(),
        create: (ref, data) => {
          if (documents.has(ref.key)) throw new Error("duplicate document");
          documents.set(ref.key, data);
        },
        set: (ref, data) => documents.set(ref.key, data),
        update: (ref, data) => documents.set(ref.key, { ...documents.get(ref.key), ...data }),
        delete: ref => documents.delete(ref.key),
      }),
  });
  process.env.STUDIO_NVIDIA_VFX_URL = "https://nvidia.test.invalid";
  process.env.STUDIO_NVIDIA_VFX_SECRET = "s".repeat(32);
});
afterEach(() => {
  delete process.env.STUDIO_NVIDIA_VFX_URL;
  delete process.env.STUDIO_NVIDIA_VFX_SECRET;
  delete process.env.STUDIO_MODEL_VFX_URL;
  delete process.env.STUDIO_MODEL_VFX_SECRET;
});

test('verified model masks create a real CPU preview job and use the unchanged owned export contract',async()=>{
  process.env.STUDIO_MODEL_VFX_URL='http://127.0.0.1:6199';
  process.env.STUDIO_MODEL_VFX_SECRET='s'.repeat(32);
  const modelArtifactRef={artifactHash:'e'.repeat(64)},sourceSha256='b'.repeat(64),manifestSha256='f'.repeat(64);
  objects.get(scene().sourceStoragePath).metadata.sha256=sourceSha256;
  const resolver=require('../src/services/studioModelCapabilityService').resolveSubjectMaskInputs;
  resolver.mockResolvedValue({artifactHash:modelArtifactRef.artifactHash,sourceSha256,manifestSha256});
  axios.post.mockImplementation(async(_url,spec)=>({data:{jobId:spec.jobId}}));
  const {jobId}=await createSubjectVfxPreview({ownerUid,scene:scene(),clientRequestId:'model-mask-preview-123',modelArtifactRef});
  expect(axios.post.mock.calls[0][0]).toBe('http://127.0.0.1:6199/jobs');
  expect(axios.post.mock.calls[0][1].modelInput.artifactHash).toBe(modelArtifactRef.artifactHash);
  expect(documents.has('studio_subject_vfx_capacity/nvidia')).toBe(false);
  const preview=await finish(jobId,{encoder:'libx264',modelArtifactHash:modelArtifactRef.artifactHash,
    gpuCount:0,elapsed_seconds:1,mask_manifest_sha256:manifestSha256,implementation_sha256:'a'.repeat(64)});
  expect(preview.receipt.derivativeArtifactHash).toMatch(/^[a-f0-9]{64}$/);
  expect(saves).toHaveLength(2);
  expect(await resolveSubjectVfxExport(exportItems(jobId))).toHaveLength(1);
  expect(resolver.mock.calls.at(-1)[0]).toMatchObject({ownerUid,signFiles:false,sourceSha256,sourceGeneration:'123'});
  expect(documents.has('studio_subject_vfx_capacity/model_artifact_cpu')).toBe(false);
});

test.each([null,false,[], 'not-a-reference'])('malformed mask reference never falls back to inference: %j',async(modelArtifactRef)=>{
  await expect(createSubjectVfxPreview({ownerUid,scene:scene(),clientRequestId:'invalid-mask-ref-123',modelArtifactRef})).rejects.toMatchObject({statusCode:422});
  expect(axios.post).not.toHaveBeenCalled();
});

test("owned completed preview resolves to the same source-bound export artifact after splitting", async () => {
  const { jobId } = await create();
  const preview = await finish(jobId);
  expect(preview.status).toBe("completed");
  expect(preview.url).toContain(`/${ownerUid}/${jobId}/render.mp4`);
  expect(saves).toHaveLength(1);
  const result = await resolveSubjectVfxExport(exportItems(jobId));
  expect(result[0]).toMatchObject({
    jobId,
    ownerUid,
    source_clip_id: "source-a",
    start_time: 2,
    end_time: 8,
    sha256: sha(bytes),
    source_sha256: "b".repeat(64),
  });
  expect(documents.has("studio_subject_vfx_capacity/nvidia")).toBe(false);
});
test("point tuples survive durable storage without Firestore nested arrays", async () => {
  const { jobId } = await create();
  const stored = job(jobId);
  expect(stored.scene).toBeUndefined();
  expect(typeof stored.sceneJson).toBe("string");
  expect(JSON.parse(stored.sceneJson)).toEqual(scene());
  expect(axios.post.mock.calls[0][1].scene).toEqual(scene());
  await finish(jobId);
  expect(await resolveSubjectVfxExport(exportItems(jobId))).toHaveLength(1);
});
test("a lost dispatch acknowledgment retries the same job and binds request identity to its scene", async () => {
  axios.post.mockRejectedValueOnce(new Error("connection lost"));
  const request = { ownerUid, scene: scene(), clientRequestId: "uncertain-request-123" };
  const first = await createSubjectVfxPreview(request);
  expect(job(first.jobId).status).toBe("dispatch_uncertain");
  axios.post.mockImplementation(async (_url, spec) => ({ data: { jobId: spec.jobId } }));
  expect(await createSubjectVfxPreview(request)).toEqual({ jobId: first.jobId, reused: true });
  expect(axios.post.mock.calls.map(([, body]) => body.jobId)).toEqual([first.jobId, first.jobId]);
  const changed = scene();
  changed.effects[0].text = "CHANGED";
  await expect(createSubjectVfxPreview({ ...request, scene: changed })).rejects.toMatchObject({
    statusCode: 409,
  });
});
test("offline and busy workers fail before another render is dispatched", async () => {
  delete process.env.STUDIO_NVIDIA_VFX_URL;
  await expect(
    createSubjectVfxPreview({ ownerUid, scene: scene(), clientRequestId: "request-offline" })
  ).rejects.toMatchObject({ statusCode: 503 });
  expect(axios.post).not.toHaveBeenCalled();
  process.env.STUDIO_NVIDIA_VFX_URL = "https://nvidia.test.invalid";
  await create();
  await expect(create("second-request-123")).rejects.toMatchObject({ statusCode: 429 });
  expect(axios.post).toHaveBeenCalledTimes(1);
  expect(await resolveSubjectVfxExport({ ownerUid, items: [], timeline: [] })).toEqual([]);
});
test("owner changes, source replacement, forged browser URLs, and partial ranges cannot be exported", async () => {
  const { jobId } = await create();
  await finish(jobId);
  const input = exportItems(jobId);
  await expect(getSubjectVfxPreview({ ownerUid: "someone-else", jobId })).rejects.toMatchObject({
    statusCode: 404,
  });
  await expect(
    resolveSubjectVfxExport({ ...input, items: [{ ...input.items[0], url: "http://localhost" }] })
  ).rejects.toMatchObject({ statusCode: 422 });
  await expect(
    resolveSubjectVfxExport({ ...input, timeline: [{ ...input.timeline[0], start_time: 1 }] })
  ).rejects.toMatchObject({ statusCode: 422 });
  objects.get(scene().sourceStoragePath).generation = "124";
  await expect(resolveSubjectVfxExport(input)).rejects.toMatchObject({ statusCode: 409 });
  objects.get(scene().sourceStoragePath).metadata.ownerUid = "other";
  await expect(resolveSubjectVfxExport(input)).rejects.toMatchObject({ statusCode: 403 });
});
test.each([
  { seconds: undefined },
  { seconds: NaN },
  { requestHash: "c".repeat(64) },
  { frames: 143 },
  { encoder: "libx264" },
  { output_sha256: "d".repeat(64) },
])("rejects invalid completed receipts or media checksums: %j", async invalid => {
  const { jobId } = await create();
  await expect(finish(jobId, invalid)).rejects.toMatchObject({ statusCode: 502 });
  expect(saves).toHaveLength(0);
});
test("cancellation won during download cannot be overwritten by late completion", async () => {
  const { jobId } = await create();
  axios.get.mockImplementation(async url => {
    if (url.endsWith("/media")) {
      job(jobId).status = "cancelled";
      return { data: bytes };
    }
    return {
      data: {
        jobId,
        ownerUid,
        requestHash: job(jobId).requestHash,
        status: "completed",
        receipt: receipt(jobId),
      },
    };
  });
  expect(await getSubjectVfxPreview({ ownerUid, jobId })).toMatchObject({ status: "cancelled" });
  expect(job(jobId).status).toBe("cancelled");
});
test("cancellation is not reported until the worker confirms it", async () => {
  const { jobId } = await create();
  axios.delete.mockResolvedValueOnce({ data: { status: "completed" } });
  await expect(cancelSubjectVfxPreview({ ownerUid, jobId })).rejects.toMatchObject({
    statusCode: 502,
  });
  expect(job(jobId).status).toBe("queued");
  axios.delete.mockResolvedValueOnce({ data: { status: "cancelled" } });
  expect(await cancelSubjectVfxPreview({ ownerUid, jobId })).toMatchObject({ status: "cancelled" });
});
