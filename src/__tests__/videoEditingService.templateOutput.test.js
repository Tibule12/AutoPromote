const mockPost = jest.fn();
jest.mock("axios", () => ({ post: mockPost }));
jest.mock("firebase-admin", () => ({ firestore: jest.fn(() => ({})) }));
jest.mock("../services/mediaWorkerTaskQueue", () => ({ queueAudioExtractionTask: jest.fn() }));
jest.mock("../creditSystem", () => ({ deductCredits: jest.fn(), refundCredits: jest.fn() }));
jest.mock("../utils/cloudRunAuth", () => ({ buildWorkerRequestConfig: jest.fn() }));
jest.mock("../services/cloudRunJobService", () => ({}));
jest.mock("../services/multicamCapacityService", () => ({}));
jest.mock("../services/studioWorkerOutputService", () => ({
  ...jest.requireActual("../services/studioWorkerOutputService"),
  persistWorkerBucketOutput: jest.fn().mockResolvedValue(null),
}));
const {persistWorkerBucketOutput} = require("../services/studioWorkerOutputService");
const VideoEditingService = require("../services/videoEditingService");

test("native worker transport and completed output retain the exact template provenance", async () => {
  const instance = { schemaVersion: 1, templateRef: { templateId: "product_launch_cinematic_v1",
    version: "1.0.0", definitionHash: "a".repeat(64) }, ownerUid: "owner-a", instantiatedBy: "manual" };
  mockPost.mockResolvedValue({ data: { status: "completed", output_url: "https://media.invalid/final.mp4",
    duration: 20, creative_template_instance: instance } });
  const result = await new VideoEditingService().processVideo("https://media.invalid/source.mp4",
    { renderViral: true, viralData: { start_time: 0, end_time: 20,
      creative_template_instance: instance } }, "owner-a", "owned-render-job");
  expect(mockPost.mock.calls[0][1]).toMatchObject({ job_id: "owned-render-job",
    creative_template_instance: instance });
  expect(result.creativeTemplateInstance).toEqual(instance);
});

test("direct worker uploads preserve a trusted output hash and byte count", async () => {
  mockPost.mockResolvedValue({ data: { status: "completed", output_url: "https://media.invalid/final.mp4",
    output_sha256: "b".repeat(64), output_bytes: 12345 } });
  const result = await new VideoEditingService().processVideo("https://media.invalid/source.mp4",
    { renderViral: true, viralData: { start_time: 0, end_time: 20 } }, "owner-a", "owned-render-job");
  expect(result).toMatchObject({ outputSha256: "b".repeat(64), outputBytes: 12345 });
});

test("missing or malformed worker integrity is not fabricated", async () => {
  for (const output_sha256 of [undefined, "not-a-hash", "A".repeat(64)]) {
    mockPost.mockResolvedValue({ data: { status: "completed", output_url: "https://media.invalid/final.mp4",
      output_sha256, output_bytes: 12345 } });
    const result = await new VideoEditingService().processVideo("https://media.invalid/source.mp4",
      { renderViral: true, viralData: { start_time: 0, end_time: 20 } }, "owner-a", "owned-render-job");
    expect(result.outputSha256).toBeUndefined(); expect(result.outputBytes).toBeUndefined();
  }
});


test("fresh Studio completion binds the verified owned object returned by bucket adoption", async () => {
  const sha="c".repeat(64),jobId="owned-render-job",url=`https://storage.googleapis.com/private-bucket/processed/${jobId}_viral.mp4`;
  mockPost.mockResolvedValue({data:{status:"completed",output_url:url,output_sha256:sha,output_bytes:12345}});
  persistWorkerBucketOutput.mockResolvedValueOnce({url:"https://storage.example.com/owned.mp4",
    storagePath:`studio/exports/owner-a/${jobId}/render.mp4`,sha256:sha,bytes:12345,generation:"456"});
  const result=await new VideoEditingService().processVideo("https://media.invalid/source.mp4",
    {renderViral:true,viralData:{start_time:0,end_time:20}},"owner-a",jobId);
  expect(persistWorkerBucketOutput).toHaveBeenLastCalledWith({url,userId:"owner-a",jobId,expectedSha256:sha});
  expect(result).toMatchObject({url:"https://storage.example.com/owned.mp4",
    outputStoragePath:`studio/exports/owner-a/${jobId}/render.mp4`,outputSha256:sha,outputBytes:12345,outputGeneration:"456"});
});
