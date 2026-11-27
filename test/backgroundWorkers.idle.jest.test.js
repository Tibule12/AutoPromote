const mockGet = jest.fn().mockResolvedValue({ docs: [], empty: true });
const mockQuery = {
  where() {
    return this;
  },
  orderBy() {
    return this;
  },
  limit() {
    return this;
  },
  get: mockGet,
};
const mockCollection = jest.fn(() => mockQuery);
const mockTasks = jest.fn().mockResolvedValue(false),
  mockSchedules = jest.fn().mockResolvedValue(false);
jest.mock("../src/firebaseAdmin", () => ({ db: { collection: mockCollection }, admin: {} }));
jest.mock("../src/services/backgroundWorkService", () => ({
  hasTasks: mockTasks,
  hasSchedules: mockSchedules,
}));
jest.mock("../src/optimizationService", () => ({}));
jest.mock("../src/paypalClient", () => ({}));
const {
  processNextPlatformTask,
  processNextYouTubeTask,
} = require("../src/services/promotionTaskQueue");
const promotion = require("../src/promotionService");
beforeEach(() => {
  delete process.env.FREE_FIRST_USAGE_ENABLED;
  jest.clearAllMocks();
  mockTasks.mockResolvedValue(false);
  mockSchedules.mockResolvedValue(false);
});
afterEach(() => { delete process.env.FREE_FIRST_USAGE_ENABLED; });

test("renewable publishing cannot dequeue or upload without a reserved dispatcher context", async () => {
  process.env.FREE_FIRST_USAGE_ENABLED = "true";
  mockTasks.mockResolvedValue(true);
  await expect(processNextPlatformTask()).rejects.toMatchObject({code:"BOUNDED_PROCESSING_ADAPTER_REQUIRED"});
  await expect(processNextYouTubeTask()).rejects.toMatchObject({code:"BOUNDED_PROCESSING_ADAPTER_REQUIRED"});
  expect(mockCollection).not.toHaveBeenCalled();
});

test("idle publishing workers stop before queue/content scans", async () => {
  expect(await processNextPlatformTask({ background: true })).toBeNull();
  expect(await processNextYouTubeTask({ background: true })).toBeNull();
  expect(mockCollection).not.toHaveBeenCalled();
});

test("idle schedule worker stops before recovery scans while manual checks still execute", async () => {
  expect(await promotion.processDueSchedules({ background: true })).toBe(0);
  expect(mockCollection).not.toHaveBeenCalled();
  expect(await promotion.processDueSchedules()).toBe(0);
  expect(mockGet).toHaveBeenCalledTimes(2);
});

test("newly available queue work still reaches the authoritative query", async () => {
  mockTasks.mockResolvedValue(true);
  expect(await processNextPlatformTask({ background: true })).toBeNull();
  expect(mockCollection).toHaveBeenCalledWith("promotion_tasks");
  expect(mockGet).toHaveBeenCalledTimes(1);
});
