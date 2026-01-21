const { recordLockTakeoverAttempt } = require("../aggregationService");

jest.setTimeout(10000);

test("aggregationService lock takeover call succeeds (no throw)", async () => {
  // ensure function is callable and returns without throwing
  await expect(recordLockTakeoverAttempt("twitter")).resolves.toBeUndefined();
});
