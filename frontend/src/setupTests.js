// Jest DOM custom matchers for testing-library
// Use a safe require so the package can be resolved when Jest is run from the monorepo root
try {
  // prefer ESM style import where supported
  require("@testing-library/jest-dom");
} catch (e) {
  try {
    // Fallback: require directly from the frontend node_modules path (makes running from root reliable)
    const path = require("path");
    const pkgPath = path.resolve(__dirname, "..", "node_modules", "@testing-library", "jest-dom");
    require(pkgPath);
  } catch (e2) {
    // If even the fallback fails, continue silently — tests that need jest-dom will fail later with a clearer error
    /* no-op */
  }
}

// Replace firebase client with a lightweight mock for jest environments (avoids node-specific fetch usage)
jest.mock("./firebaseClient", () => ({
  auth: {
    currentUser: {
      getIdToken: async () => "test-token",
      uid: "test-user",
    },
  },
  db: {},
  storage: {},
}));

// jsdom doesn't implement URL.createObjectURL by default; stub it for preview generation & tests
if (typeof global.URL.createObjectURL !== "function") {
  global.URL.createObjectURL = obj => `blob://${(obj && obj.name) || "mock"}`;
}
if (typeof global.URL.revokeObjectURL !== "function") {
  global.URL.revokeObjectURL = () => {};
}
