import { canUseLocalTestAuth } from "../localTestAuth";

test.each([
  ["http://localhost:5128", "http://localhost:5000", true],
  ["http://127.0.0.1:5128", "http://localhost:5000", true],
  ["http://[::1]:5128", "http://localhost:5000", true],
  ["https://api.autopromote.org", "http://localhost:5000", false],
  ["http://localhost:5128", "https://autopromote.org", false],
  ["http://localhost.attacker.test", "http://localhost:5000", false],
  ["https://api.autopromote.org", "https://autopromote.org", false],
  ["javascript:alert(1)", "http://localhost:5000", false],
])("synthetic credentials for API %s from page %s are allowed: %s", (api, page, expected) => {
  expect(canUseLocalTestAuth(api, new URL(page))).toBe(expected);
});
