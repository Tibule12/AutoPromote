import { studioSourceLeaseRefreshDelay } from "../studioSourceAccess";

const now = 1792848000000;
const signed = expiry => `https://storage.googleapis.com/owned/source.mp4?GoogleAccessId=owner&Signature=signature&Expires=${expiry}`;

test("renews temporary source access one minute before expiry", () => {
  expect(studioSourceLeaseRefreshDelay(signed(now / 1000 + 3600), now)).toBe(3540000);
});
test("expired and imminently expiring source links recover immediately", () => {
  expect(studioSourceLeaseRefreshDelay(signed(1792783090), now)).toBe(0);
  expect(studioSourceLeaseRefreshDelay(signed(now / 1000 + 30), now)).toBe(0);
});
test.each(["", "blob:source", "https://example.com/source.mp4", signed("invalid"), signed("0"),
  "https://example.com/source.mp4?Expires=1792840000"])("ignores nonleased or malformed access: %s", url => {
  expect(studioSourceLeaseRefreshDelay(url, now)).toBeNull();
});
test("keeps browser timer delay inside its signed32-bit limit", () => {
  expect(studioSourceLeaseRefreshDelay(signed(now / 1000 + 86400000), now)).toBe(2147483647);
});
