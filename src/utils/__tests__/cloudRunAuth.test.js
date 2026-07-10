describe("cloudRunAuth URL policy", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.K_SERVICE;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GCLOUD_PROJECT;
    delete process.env.WORKER_AUTH_MODE;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("never requests identity tokens for local workers", () => {
    process.env.WORKER_AUTH_MODE = "oidc";
    const { shouldAuthenticateWorkerUrl } = require("../cloudRunAuth");
    expect(shouldAuthenticateWorkerUrl("http://127.0.0.1:8000/health")).toBe(false);
  });

  it("uses OIDC automatically inside Cloud Run", () => {
    process.env.K_SERVICE = "thulani-api";
    const { shouldAuthenticateWorkerUrl } = require("../cloudRunAuth");
    expect(
      shouldAuthenticateWorkerUrl("https://cam-combiner-worker-abc.us-central1.run.app/health")
    ).toBe(true);
  });

  it("supports an explicit no-auth override for public development workers", () => {
    process.env.K_SERVICE = "thulani-api";
    process.env.WORKER_AUTH_MODE = "none";
    const { shouldAuthenticateWorkerUrl } = require("../cloudRunAuth");
    expect(shouldAuthenticateWorkerUrl("https://worker.example.com/health")).toBe(false);
  });
});
