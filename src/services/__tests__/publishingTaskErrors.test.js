const { classifyPublishingError, publishingError } = require("../publishingTaskErrors");
const { accessTokenExpiresAt } = require("../connectionTokenExpiry");

test("the exact LinkedIn failure is terminal auth rather than generic retry", () => {
  const error = new Error(
    'Failed to get LinkedIn profile: {"status":401,"code":"EXPIRED_ACCESS_TOKEN","message":"The token used in the request has expired"}'
  );
  expect(classifyPublishingError(error)).toBe("auth");
  expect(
    classifyPublishingError(publishingError("provider rejected input", "validation", 400))
  ).toBe("validation");
  expect(classifyPublishingError(publishingError("lookup timeout", "publication_pending"))).toBe(
    "publication_pending"
  );
});

test.each([
  "2026-10-13T16:00:00Z",
  new Date("2026-10-13T16:00:00Z"),
  { _seconds: 1791907200 },
  { seconds: 1791907200 },
  { toMillis: () => Date.parse("2026-10-13T16:00:00Z") },
])("handles connection timestamp format %p", updatedAt => {
  expect(accessTokenExpiresAt({ updatedAt }, { expires_in: 3600 })).toBe(
    Date.parse("2026-10-13T17:00:00Z")
  );
});

test("unknown issue date is not treated as an epoch expiry", () => {
  expect(Number.isNaN(accessTokenExpiresAt({}, { expires_in: 3600 }))).toBe(true);
});
