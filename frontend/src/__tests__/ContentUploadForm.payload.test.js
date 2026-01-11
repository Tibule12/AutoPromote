import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ContentUploadForm from "../ContentUploadForm";

// Increase timeout for multi-step submit flows in CI
jest.setTimeout(20000);

// Mock firebase storage to avoid network calls during tests
jest.mock("firebase/storage", () => {
  const actual = jest.requireActual("firebase/storage");
  return {
    ...actual,
    ref: jest.fn(() => ({})),
    uploadBytes: jest.fn(async () => ({ success: true })),
    getDownloadURL: jest.fn(async () => "https://example.com/test.mp4"),
  };
});

describe("ContentUploadForm payloads", () => {
  test("Preview payload contains platforms and platform_options", async () => {
    const onUpload = jest.fn(async payload => ({
      previews: [{ platform: "youtube", title: payload.title }],
    }));
    const { rerender } = render(<ContentUploadForm onUpload={onUpload} />);

    // Pre-select Discord and YouTube so Discord options are available
    rerender(<ContentUploadForm onUpload={onUpload} selectedPlatforms={["discord", "youtube"]} />);
    const discordChannel = await screen.findByPlaceholderText(/Discord channel ID/i);
    fireEvent.change(discordChannel, { target: { value: "12345" } });

    // Click YouTube tile to open its focused view and provide per-platform fields
    const youtubeBtns = screen.getAllByRole("button", { name: /YouTube/i });
    const youtubeTile = youtubeBtns.find(b => b.classList && b.classList.contains("platform-card"));
    expect(youtubeTile).toBeDefined();
    fireEvent.click(youtubeTile);

    // Provide per-platform title and file
    fireEvent.change(screen.getByLabelText(/Platform title youtube/i), {
      target: { value: "Test Title" },
    });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/Platform file youtube/i);
    fireEvent.change(fileInput, { target: { files: [file] } });
    // Add overlay text, then click preview button
    const overlayInput = screen.getByPlaceholderText(/Add overlay text/i);
    fireEvent.change(overlayInput, { target: { value: "Hello Overlay" } });
    const overlayPos = screen.getByLabelText(/Overlay position/i);
    fireEvent.change(overlayPos, { target: { value: "top" } });

    // Click preview button
    const previewBtn = screen.getByLabelText(/Preview Content/i);
    fireEvent.click(previewBtn);

    // Wait for onUpload to be called (increased timeout for CI reliability)
    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 5000 });
    const payload = onUpload.mock.calls[0][0];
    expect(Array.isArray(payload.platforms)).toBeTruthy();
    expect(payload.platforms).toContain("discord");
    expect(payload.platforms).toContain("youtube");
    expect(payload.platform_options).toBeDefined();
    expect(payload.platform_options.discord.channelId).toBe("12345");
    expect(payload.meta).toBeDefined();
    expect(payload.meta.overlay).toBeDefined();
    expect(payload.meta.overlay.text).toBe("Hello Overlay");
    expect(payload.meta.overlay.position).toBe("top");
  });

  test("Submit payload includes platforms and platform_options", async () => {
    const onUpload = jest.fn(async () => ({}));
    render(<ContentUploadForm onUpload={onUpload} />);

    // Click YouTube to open focused view and provide per-platform fields
    const youtubeBtns = screen.getAllByRole("button", { name: /YouTube/i });
    const youtubeTile = youtubeBtns.find(b => b.classList && b.classList.contains("platform-card"));
    expect(youtubeTile).toBeDefined();
    fireEvent.click(youtubeTile);

    // Provide a file in the focused view and click the per-platform Upload button
    const file2 = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput2 = screen.getByLabelText(/Platform file youtube/i);
    fireEvent.change(fileInput2, { target: { files: [file2] } });

    // Set overlay text before upload
    const overlay = screen.getByPlaceholderText(/Add overlay text/i);
    fireEvent.change(overlay, { target: { value: "Submit Overlay" } });

    const perUploadBtn = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(perUploadBtn);

    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 10000 });
    const payload = onUpload.mock.calls[0][0];
    console.log("[TEST] payload:", payload);
    expect(Array.isArray(payload.platforms)).toBeTruthy();
    expect(payload.platforms).toContain("youtube");
    expect(payload.meta).toBeDefined();
    console.log("[TEST] payload.meta:", payload.meta);
    expect(payload.meta.overlay).toBeDefined();
    expect(payload.meta.overlay.text).toBe("Submit Overlay");
  });

  test("Payload includes Twitter and LinkedIn specific options", async () => {
    const onUpload = jest.fn(async () => ({}));
    const { rerender } = render(<ContentUploadForm onUpload={onUpload} />);

    // Select Twitter and LinkedIn
    rerender(<ContentUploadForm onUpload={onUpload} selectedPlatforms={["twitter", "linkedin"]} />);

    // Twitter Settings
    const twitterBtns = screen.getAllByRole("button", { name: /Twitter/i });
    const twitterTile = twitterBtns.find(b => b.classList.contains("platform-card"));
    expect(twitterTile).toBeDefined();
    fireEvent.click(twitterTile);

    // Toggle Thread Support (using getByLabelText with regex)
    const threadCheck = screen.getByLabelText(/Thread Mode/i);
    fireEvent.click(threadCheck);
    expect(threadCheck).toBeChecked();

    // Click Back to return to platform list
    const backBtn = screen.getByRole("button", { name: /Back to platforms/i });
    fireEvent.click(backBtn);

    // LinkedIn Settings
    const linkedinBtns = screen.getAllByRole("button", { name: /LinkedIn/i });
    const linkedinTile = linkedinBtns.find(b => b.classList.contains("platform-card"));
    expect(linkedinTile).toBeDefined();
    fireEvent.click(linkedinTile);

    // Select Post Type
    const postTypeSelect = screen.getByRole("combobox", { name: /Post Type/i });
    // OR create a more specific query if multiple selects exist.
    // In LinkedIn view, we just added the select.
    fireEvent.change(postTypeSelect, { target: { value: "article" } });

    // Supply Company ID
    const companyIdInput = screen.getByPlaceholderText(/Organization ID/i);
    fireEvent.change(companyIdInput, { target: { value: "123456" } });

    // Provide file for LinkedIn
    const file = new File(["dummy"], "test.png", { type: "image/png" });
    const fileInput = screen.getByLabelText(/Platform file linkedin/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Upload
    const uploadBtn = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(uploadBtn);

    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 5000 });
    const payload = onUpload.mock.calls[0][0];

    expect(payload.platforms).toContain("linkedin");
    // Twitter may or may not be in platforms if we didn't provide a file for it?
    // The Main Upload logic iterates over platforms. If a platform has no file, it might skip or use main file.
    // Here we only provided file for LinkedIn (via per-platform input).
    // But we selected both in "selectedPlatforms".
    // Let's check payload.platform_options regardless.

    expect(payload.platform_options.twitter).toBeDefined();
    expect(payload.platform_options.twitter.threadMode).toBe(true);

    expect(payload.platform_options.linkedin).toBeDefined();
    expect(payload.platform_options.linkedin.postType).toBe("article");
  });
});

export {};
