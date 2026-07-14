describe("cloudRunJobService", () => {
  const originalName = process.env.MULTICAM_RENDER_JOB_NAME;
  const originalFastName = process.env.MULTICAM_FAST_RENDER_JOB_NAME;
  const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
  const originalRegion = process.env.MULTICAM_RENDER_JOB_REGION;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRender = process.env.RENDER;

  afterEach(() => {
    jest.resetModules();
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
});
