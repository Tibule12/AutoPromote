const { classifyPublishingError, publishingError } = require("../publishingTaskErrors");
const { accessTokenExpiresAt } = require("../connectionTokenExpiry");
const {execFileSync}=require('node:child_process');

test.each(['access token has expired','No valid YouTube access token is available','Invalid_Grant'])('keeps terminal token errors out of publication retries: %s',message=>{
  expect(classifyPublishingError(message)).toBe('auth');
});
test('classifies a large adversarial provider error within a bounded process deadline',()=>{
  const output=execFileSync(process.execPath,['-e',
    "const {classifyPublishingError}=require(process.argv[1]);process.stdout.write(classifyPublishingError('no valid '.repeat(30000)+'network timeout'));",
    require.resolve('../publishingTaskErrors')],{timeout:2000,encoding:'utf8'});
  expect(output).toBe('transient');
});

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
