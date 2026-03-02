import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import MemeticComposerPanel from "../MemeticComposerPanel";

// Increase timeout for async operations
jest.setTimeout(20000);

// Setup mocks manually to prevent "jest.mock" hoisting issues with imports
jest.mock("firebase/auth", () => ({
  getAuth: jest.fn(),
}));
jest.mock("firebase/storage", () => ({
  getStorage: jest.fn(),
  ref: jest.fn(),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(),
}));

// Mock global fetch
global.fetch = jest.fn();

describe("MemeticComposerPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const { getAuth } = require("firebase/auth");
    const { getStorage, ref, uploadBytes, getDownloadURL } = require("firebase/storage");

    // Setup Auth Mock
    getAuth.mockReturnValue({
      currentUser: {
        uid: "test-user-id",
        getIdToken: jest.fn().mockResolvedValue("fake-token"),
      },
    });

    // Setup Storage Mock
    getStorage.mockReturnValue({});
    ref.mockReturnValue({});
    uploadBytes.mockResolvedValue({});
    getDownloadURL.mockResolvedValue("https://example.com/uploaded-video.mp4");

    // Default Fetch Mock
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    // Mock Canvas context
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      moveTo: jest.fn(),
      lineTo: jest.fn(),
      stroke: jest.fn(),
      fill: jest.fn(),
      createLinearGradient: jest.fn(() => ({
        addColorStop: jest.fn(),
      })),
      closePath: jest.fn(),
      fillText: jest.fn(),
      strokeStyle: "",
      lineWidth: 0,
      fillStyle: "",
    }));

    // Mock URL.createObjectURL
    if (typeof window !== "undefined") {
      window.URL.createObjectURL = jest.fn(() => "blob:test-video");
    } else {
      global.URL.createObjectURL = jest.fn(() => "blob:test-video");
    }
  });

  afterEach(() => {
    // Clean up mocks is handled by beforeEach(jest.clearAllMocks)
  });

  test("renders component correctly", () => {
    render(<MemeticComposerPanel onClose={() => {}} />);
    expect(screen.getByText("MEMETIC COMPOSER_")).toBeInTheDocument();
  });

  test("handles video upload and generates mutations", async () => {
    render(<MemeticComposerPanel onClose={() => {}} />);

    // Setup specific fetch mock for this test
    global.fetch.mockImplementation(url => {
      // Check if URL ends with the endpoint
      if (url.includes("/api/media/memetic/plan")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            variants: [
              {
                id: "v1",
                title: "Dark Humor Variant",
                style: "dark",
                reason: "Matched high valence",
                viralScore: 92,
                previewUrl: "https://example.com/v1_preview.mp4",
              },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    // Find input by ID directly because label matching can be flaky with hidden inputs
    // Using simple querySelector on document body mostly works in JSDOM
    const fileInput = document.getElementById("seed-upload");
    const file = new File(["dummy content"], "test.mp4", { type: "video/mp4" });

    // Simulate file selection
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    // Wait for the "Clear" button to appear (indicating videoUrl state is set)
    const clearBtn = await screen.findByText("🗑️ Clear");
    expect(clearBtn).toBeInTheDocument();

    // The generate button should become active
    const generateBtn = screen.getByText(/GENERATE MUTATIONS/i);
    expect(generateBtn).toBeEnabled();

    // Click Generate
    await act(async () => {
      fireEvent.click(generateBtn);
    });

    // Wait for fetch to happen
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    // Check if variant is displayed
    const variantTitle = await screen.findByText("Dark Humor Variant");
    expect(variantTitle).toBeInTheDocument();
  });
});
