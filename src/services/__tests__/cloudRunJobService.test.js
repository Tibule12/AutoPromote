const mockRequest = jest.fn();
jest.mock("google-auth-library", () => ({
  GoogleAuth: jest.fn(() => ({
    getClient: async () => ({ request: mockRequest }),
    getProjectId: async () => "example-project",
  })),
}));
describe("cloudRunJobService", () => {
  const originalName = process.env.MULTICAM_RENDER_JOB_NAME;
  const originalFastName = process.env.MULTICAM_FAST_RENDER_JOB_NAME;
  const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
  const originalRegion = process.env.MULTICAM_RENDER_JOB_REGION;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRender = process.env.RENDER;

  afterEach(() => {
    jest.resetModules();
    mockRequest.mockReset();
    delete process.env.MULTICAM_GPU_RENDER_JOB_NAME;
    delete process.env.MULTICAM_GPU_PRIMARY;
    delete process.env.MEDIA_WORKER_ROUTING_POLICY;
    delete process.env.FREE_FIRST_USAGE_ENABLED;
    if (originalName === undefined) delete process.env.MULTICAM_RENDER_JOB_NAME;
    else process.env.MULTICAM_RENDER_JOB_NAME = originalName;
    if (originalFastName === undefined) delete process.env.MULTICAM_FAST_RENDER_JOB_NAME;
    else process.env.MULTICAM_FAST_RENDER_JOB_NAME = originalFastName;
    if (originalProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = originalProject;
    if (originalRegion === undefined) delete process.env.MULTICAM_RENDER_JOB_REGION;
    else process.env.MULTICAM_RENDER_JOB_REGION = originalRegion;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalRender === undefined) delete process.env.RENDER;
    else process.env.RENDER = originalRender;
  });
  it("opt-in short manual Cam edit uses the existing CPU job without changing its output or retrying", async () => {
    process.env.MEDIA_WORKER_ROUTING_POLICY="cost-aware-v1";
    process.env.NODE_ENV="production";
    process.env.GOOGLE_CLOUD_PROJECT="example-project";
    mockRequest.mockResolvedValue({data:{name:"projects/example-project/locations/us-central1/operations/cpu"}});
    const {executeMulticamRenderJob}=require('../cloudRunJobService');
    const result=await executeMulticamRenderJob({jobId:'short-manual',dispatchToken:'one-token',multicamRequest:{
      sources:[{id:'a'},{id:'b'}],overlapDuration:60,burnCaptions:false,segments:[{camera_id:'a',timeline_start:0,timeline_end:60}]}});
    expect(result).toMatchObject({device:'cpu',routeReason:'qualified_short_cpu'});
    expect(mockRequest.mock.calls[0][0].url).toContain('cam-combiner-render-fast-job:run');
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });

  it("builds a one-task execution with only scoped render identity overrides", () => {
    const { buildRunJobOverrides } = require("../cloudRunJobService");
    expect(buildRunJobOverrides("job-12345678", "dispatch-token")).toEqual({
      overrides: {
        containerOverrides: [
          {
            env: [
              { name: "MULTICAM_JOB_ID", value: "job-12345678" },
              { name: "MULTICAM_DISPATCH_TOKEN", value: "dispatch-token" },
            ],
          },
        ],
        taskCount: 1,
      },
    });
  });

  it("resolves a short job name into the Cloud Run v2 resource", async () => {
    process.env.MULTICAM_RENDER_JOB_NAME = "cam-combiner-render-job";
    process.env.GOOGLE_CLOUD_PROJECT = "example-project";
    process.env.MULTICAM_RENDER_JOB_REGION = "africa-south1";
    const { resolveJobResourceName } = require("../cloudRunJobService");
    await expect(resolveJobResourceName()).resolves.toBe(
      "projects/example-project/locations/africa-south1/jobs/cam-combiner-render-job"
    );
  });

  it("defaults to the durable production job on Render", () => {
    delete process.env.MULTICAM_RENDER_JOB_NAME;
    process.env.NODE_ENV = "production";
    process.env.RENDER = "true";
    const { getMulticamRenderJobName } = require("../cloudRunJobService");
    expect(getMulticamRenderJobName()).toBe("cam-combiner-render-job");
  });

  it("routes no-caption renders to the lean production job", async () => {
    delete process.env.MULTICAM_FAST_RENDER_JOB_NAME;
    process.env.NODE_ENV = "production";
    process.env.GOOGLE_CLOUD_PROJECT = "example-project";
    const { getMulticamRenderJobName, resolveJobResourceName } = require("../cloudRunJobService");
    const request = { burnCaptions: false, burn_captions: false };

    expect(getMulticamRenderJobName(request)).toBe("cam-combiner-render-fast-job");
    await expect(resolveJobResourceName(request)).resolves.toBe(
      "projects/example-project/locations/us-central1/jobs/cam-combiner-render-fast-job"
    );
  });

  it("keeps caption renders on the model-equipped job", () => {
    process.env.NODE_ENV = "production";
    const { getMulticamRenderJobName } = require("../cloudRunJobService");
    expect(getMulticamRenderJobName({ burn_captions: true })).toBe("cam-combiner-render-job");
  });
  it("production dispatch uses a GPU job for both captioned and clean exports and retains the actual execution identity", async () => {
    process.env.NODE_ENV = "production";
    process.env.GOOGLE_CLOUD_PROJECT = "example-project";
    const { executeMulticamRenderJob } = require("../cloudRunJobService");
    mockRequest.mockResolvedValue({
      data: {
        name: "projects/example-project/locations/us-central1/operations/gpu-op",
        metadata: {
          name: "projects/example-project/locations/us-central1/jobs/cam-combiner-render-gpu-job/executions/one",
        },
      },
    });
    for (const captions of [false, true]) {
      const result = await executeMulticamRenderJob({
        jobId: "one-edit",
        dispatchToken: "same-dispatch-token",
        multicamRequest: { burnCaptions: captions },
      });
      expect(result.device).toBe("gpu");
      expect(result.executionName).toContain("/executions/one");
      expect(mockRequest.mock.lastCall[0]).toMatchObject({
        method: "POST",
        url: "https://run.googleapis.com/v2/projects/example-project/locations/us-central1/jobs/cam-combiner-render-gpu-job:run",
      });
      expect(mockRequest.mock.lastCall[0].data.overrides.containerOverrides[0].env).toContainEqual({
        name: "MULTICAM_FAST_NO_CAPTIONS",
        value: captions ? "0" : "1",
      });
    }
  });
  it("a definitively rejected GPU dispatch uses the CPU worker once with the original job identity", async () => {
    process.env.NODE_ENV = "production";
    process.env.GOOGLE_CLOUD_PROJECT = "example-project";
    const { executeMulticamRenderJob } = require("../cloudRunJobService");
    mockRequest
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValueOnce({
        data: { name: "cpu-operation", metadata: { name: "cpu-execution" } },
      });
    const result = await executeMulticamRenderJob({
      jobId: "one-edit",
      dispatchToken: "same-dispatch-token",
      multicamRequest: { burnCaptions: false },
    });
    expect(result).toMatchObject({ device: "cpu", routeReason: "gpu_unavailable" });
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[1][0].url).toContain("cam-combiner-render-fast-job:run");
    for (const call of mockRequest.mock.calls)
      expect(call[0].data.overrides.containerOverrides[0].env).toEqual(
        expect.arrayContaining([
          { name: "MULTICAM_JOB_ID", value: "one-edit" },
          { name: "MULTICAM_DISPATCH_TOKEN", value: "same-dispatch-token" },
        ])
      );
  });
  it("a lost GPU admission response does not blindly create a CPU execution", async () => {
    process.env.NODE_ENV = "production";
    process.env.GOOGLE_CLOUD_PROJECT = "example-project";
    const { executeMulticamRenderJob } = require("../cloudRunJobService");
    const error = { code: "ECONNRESET" };
    mockRequest.mockRejectedValueOnce(error);
    await expect(
      executeMulticamRenderJob({ jobId: "one-edit", dispatchToken: "same-token" })
    ).rejects.toBe(error);
    expect(mockRequest).toHaveBeenCalledTimes(1);
  });
});
