// Jest DOM custom matchers for testing-library
// Use a safe require so the package can be resolved when Jest is run from the monorepo root
try {
  // prefer ESM style import where supported
  require("@testing-library/jest-dom");
} catch (e) {
  try {
    // Fallback logic removed to prevent Webpack "Critical dependency" warning during build
    // (The dynamic require(pkgPath) confuses the bundler)
  } catch (e2) {
    // If even the fallback fails, continue silently — tests that need jest-dom will fail later with a clearer error
    /* no-op */
  }
}

// Polyfill TextEncoder/TextDecoder for jsdom (required by newer react-router-dom)
if (typeof global.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
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

// Provide a lightweight stub for ContentUploadForm during tests to avoid
// (Removed test-only stub for ContentUploadForm; use real component in tests)

// Provide a minimal mock of react-router-dom for Jest environment
try {
  jest.mock("react-router-dom", () => {
    const React = require("react");
    return {
      MemoryRouter: ({ children }) => React.createElement("div", null, children),
      Link: ({ to, children, ...rest }) =>
        React.createElement("a", { href: to, ...rest }, children),
      NavLink: ({ to, children, ...rest }) =>
        React.createElement("a", { href: to, ...rest }, children),
    };
  });
} catch (e) {
  // noop when jest isn't available
}

// jsdom doesn't implement URL.createObjectURL by default; stub it for preview generation & tests
if (typeof global.URL.createObjectURL !== "function") {
  global.URL.createObjectURL = obj => `blob://${(obj && obj.name) || "mock"}`;
}
if (typeof global.URL.revokeObjectURL !== "function") {
  global.URL.revokeObjectURL = () => {};
}
