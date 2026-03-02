// Jest DOM custom matchers for testing-library
try {
  require("@testing-library/jest-dom");
} catch (e) {
  // Parsing fallback removed
}

// Polyfill TextEncoder/TextDecoder for jsdom (required by newer react-router-dom)
if (typeof global.TextEncoder === "undefined") {
  const { TextEncoder, TextDecoder } = require("util");
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

// Polyfill fetch for Jest environment (using Node's native fetch if available, or a simple mock)
if (typeof global.fetch === "undefined") {
  // If we are in Node 18+, fetch is available on the process.
  // But strictly speaking, we want a spec-compliant fetch.
  // We'll use a simple mock to satisfy basic imports, or try to grab native fetch.
  // Since we don't have node-fetch installed in frontend, let's mock it sufficient for auth.
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
      blob: () => Promise.resolve(new Blob([])),
    })
  );
  global.Request = class Request {};
  global.Response = class Response {};
  global.Headers = class Headers {};
}

// Mock Canvas getContext for MemeticComposerPanel (jsdom doesn't fully support 2d context)
if (typeof HTMLCanvasElement !== "undefined") {
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillStyle: "",
      fillRect: jest.fn(),
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      createLinearGradient: jest.fn(() => ({
        addColorStop: jest.fn(),
      })),
      arc: jest.fn(),
      fill: jest.fn(),
      measureText: jest.fn(() => ({ width: 0 })),
      fillText: jest.fn(),
      save: jest.fn(),
      restore: jest.fn(),
    };
  };
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
