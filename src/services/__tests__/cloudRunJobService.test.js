describe("cloudRunJobService", () => {
  const originalName = process.env.MULTICAM_RENDER_JOB_NAME;
  const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
  const originalRegion = process.env.MULTICAM_RENDER_JOB_REGION;

  afterEach(() => {
    jest.resetModules();
    if (originalName === undefined) delete process.env.MULTICAM_RENDER_JOB_NAME;
    else process.env.MULTICAM_RENDER_JOB_NAME = originalName;
    if (originalProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = originalProject;
    if (originalRegion === undefined) delete process.env.MULTICAM_RENDER_JOB_REGION;
    else process.env.MULTICAM_RENDER_JOB_REGION = originalRegion;
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
});
