const mockHeaders = jest.fn(async () => ({ Authorization: "Bearer private-worker-identity" }));
const mockClient = jest.fn(async () => ({ getRequestHeaders: mockHeaders }));
const mockGoogleAuth = jest.fn(() => ({ getIdTokenClient: mockClient }));
jest.mock("google-auth-library", () => ({ GoogleAuth: mockGoogleAuth }));
jest.mock("../../../firebaseConfig.server", () => ({
  client_email: "backend@test-project.iam.gserviceaccount.com", private_key: "test-private-key",
}));
const prior = process.env;
beforeEach(() => {
  jest.resetModules(); jest.clearAllMocks(); process.env = { ...prior, NODE_ENV: "production" };
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS; delete process.env.K_SERVICE;
  delete process.env.WORKER_AUTH_MODE;
});
afterAll(() => { process.env = prior; });
test("Render reuses its existing Firebase identity for the private GPU and caches the audience client", async () => {
  const {buildWorkerRequestConfig} = require("../cloudRunAuth");
  expect(mockGoogleAuth).toHaveBeenCalledWith({ credentials: {
    client_email:"backend@test-project.iam.gserviceaccount.com",private_key:"test-private-key",
  }});
  const url="https://gpu.test.run.app/render-viral-clip";
  expect(await buildWorkerRequestConfig(url,{timeout:123})).toEqual({timeout:123,headers:{Authorization:"Bearer private-worker-identity"}});
  await buildWorkerRequestConfig("https://gpu.test.run.app/health");
  expect(mockClient).toHaveBeenCalledTimes(1); expect(mockClient).toHaveBeenCalledWith("https://gpu.test.run.app");
});
test.each(["GOOGLE_APPLICATION_CREDENTIALS", "K_SERVICE"])("%s retains the configured ADC or metadata identity", variable => {
  process.env[variable]="configured"; require("../cloudRunAuth");
  expect(mockGoogleAuth).toHaveBeenCalledWith({});
});
