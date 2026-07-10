describe("multicamCapacityService", () => {
  const originalMax = process.env.MULTICAM_MAX_ACTIVE_JOBS;

  afterEach(() => {
    if (originalMax === undefined) delete process.env.MULTICAM_MAX_ACTIVE_JOBS;
    else process.env.MULTICAM_MAX_ACTIVE_JOBS = originalMax;
    jest.resetModules();
  });

  it("keeps only unexpired reservations", () => {
    const { normalizeActiveJobs } = require("../multicamCapacityService");
    const now = Date.parse("2026-07-10T12:00:00.000Z");
    expect(
      normalizeActiveJobs(
        {
          active: {
            jobId: "active",
            userId: "one",
            expiresAt: "2026-07-10T13:00:00.000Z",
          },
          expired: {
            jobId: "expired",
            userId: "two",
            expiresAt: "2026-07-10T11:59:59.000Z",
          },
          malformed: { jobId: "malformed" },
        },
        now
      )
    ).toEqual({
      active: {
        jobId: "active",
        userId: "one",
        expiresAt: "2026-07-10T13:00:00.000Z",
      },
    });
  });

  it("defaults to three active jobs and clamps unsafe configuration", () => {
    let service = require("../multicamCapacityService");
    expect(service.getMaxActiveJobs()).toBe(3);

    process.env.MULTICAM_MAX_ACTIVE_JOBS = "200";
    jest.resetModules();
    service = require("../multicamCapacityService");
    expect(service.getMaxActiveJobs()).toBe(20);
  });
});
