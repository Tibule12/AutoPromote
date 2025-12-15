import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ContentUploadForm from "../ContentUploadForm";
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
    render(<ContentUploadForm onUpload={onUpload} />);

    // Fill required fields
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Test Title" } });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Test Description" },
    });

    // Add a dummy file to allow preview
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Select platforms: Discord and YouTube
    const discordToggle = screen.getByLabelText(/Discord/i);
    fireEvent.click(discordToggle);
    const youtubeToggle = screen.getByLabelText(/YouTube/i);
    fireEvent.click(youtubeToggle);

    // Set Discord channel id (platform option)
    const discordChannel = screen.getByPlaceholderText(/Discord channel ID/i);
    fireEvent.change(discordChannel, { target: { value: "12345" } });

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

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Upload Title" } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: "Desc" } });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByLabelText(/YouTube/i));

    // Submit the form
    const uploadBtn = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(uploadBtn);
    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 10000 });
    const payload = onUpload.mock.calls[0][0];
    expect(Array.isArray(payload.platforms)).toBeTruthy();
    expect(payload.platforms).toContain("youtube");

    // Overlay should also be present in submission payload if set
    // Set overlay and submit again
    const overlayInput = screen.getByPlaceholderText(/Add overlay text/i);
    fireEvent.change(overlayInput, { target: { value: "Submit Overlay" } });
    // Submit the form
    const uploadBtn2 = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(uploadBtn2);
    await waitFor(() => expect(onUpload).toHaveBeenCalledTimes(2), { timeout: 10000 });
    const payload2 = onUpload.mock.calls[onUpload.mock.calls.length - 1][0];
    expect(payload2.meta).toBeDefined();
    expect(payload2.meta.overlay).toBeDefined();
    expect(payload2.meta.overlay.text).toBe("Submit Overlay");
  });
});

export {};
