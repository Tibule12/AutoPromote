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
    fireEvent.change(screen.getByLabelText(/Video Title/i), {
      target: { value: "Test Title" },
    });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/Video File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

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
    const fileInput2 = screen.getByLabelText(/Video File/i);
    fireEvent.change(fileInput2, { target: { files: [file2] } });

    const perUploadBtn = screen.getByRole("button", { name: /Publish to Youtube/i });
    fireEvent.click(perUploadBtn);

    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 10000 });
    const payload = onUpload.mock.calls[0][0];
    console.log("[TEST] payload:", payload);
    expect(Array.isArray(payload.platforms)).toBeTruthy();
    expect(payload.platforms).toContain("youtube");
    expect(payload.meta).toBeDefined();
    console.log("[TEST] payload.meta:", payload.meta);
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

    // Supply Company ID
    const companyIdInput = screen.getByLabelText(/Organization \/ Company ID/i);
    fireEvent.change(companyIdInput, { target: { value: "123456" } });

    // Provide a file for LinkedIn validation (required to avoid "Please select a file")
    const linkedinFile = new File(["dummy_linkedin"], "linkedin_test.mp4", { type: "video/mp4" });
    const linkedinFileInput = screen.getByLabelText(/Video File/i);
    fireEvent.change(linkedinFileInput, { target: { files: [linkedinFile] } });

    // Upload
    const uploadBtn = screen.getByRole("button", { name: /Publish to Linkedin/i });
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
    // Default is "post" unless title is set and logic promotes it, but current form behavior yields "post"
    expect(payload.platform_options.linkedin.postType).toBe("post");
  });
});

export {};
