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

describe("ContentUploadForm TikTok UX enforcement", () => {
  test("E2E helper auto-checks TikTok consent when window flag is set", async () => {
    // Set E2E flag before render
    window.__E2E_TEST_TIKTOK_CONSENT = true;
    const onUpload = jest.fn(async payload => ({
      previews: [{ platform: "tiktok", title: payload.title }],
    }));

    // Force TikTok as a selected platform so payload will include tiktok options
    render(<ContentUploadForm onUpload={onUpload} selectedPlatforms={["tiktok"]} />);

    // Fill minimal fields and ensure file selected
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "TikTok Consent Test" } });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Click preview to trigger onUpload
    const previewBtn = screen.getByLabelText(/Preview Content/i);
    fireEvent.click(previewBtn);

    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 5000 });
    const payload = onUpload.mock.calls[0][0];
    expect(payload.platform_options).toBeDefined();
    expect(payload.platform_options.tiktok).toBeDefined();
    expect(payload.platform_options.tiktok.consent).toBe(true);

    // Clean up flag
    delete window.__E2E_TEST_TIKTOK_CONSENT;
  });

  test("Overlay text prevents TikTok upload (client-side validation)", async () => {
    const onUpload = jest.fn(async () => ({}));
    // Ensure TikTok is selected and set privacy so overlay check runs
    // Also set E2E consent flag so consent check doesn't short-circuit the overlay error
    window.__E2E_TEST_TIKTOK_CONSENT = true;
    render(
      <ContentUploadForm
        onUpload={onUpload}
        selectedPlatforms={["tiktok"]}
        platformOptions={{ tiktok: { privacy: "EVERYONE" } }}
      />
    );

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Overlay Test" } });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Add overlay text
    const overlayInput = screen.getByPlaceholderText(/Add overlay text/i);
    fireEvent.change(overlayInput, { target: { value: "Watermark" } });

    // Attempt platform upload and assert error message is shown
    const uploadBtn = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(uploadBtn);

    await screen.findByText(/TikTok uploads must not contain watermarks or overlay text/i, {
      timeout: 3000,
    });

    // Clean up flag
    delete window.__E2E_TEST_TIKTOK_CONSENT;
  });

  test("Branded content cannot be private and requires privacy to be public when branded is selected", async () => {
    const onUpload = jest.fn(async () => ({}));
    // Ensure TikTok is selected and privacy initially set to SELF_ONLY to trigger the error
    // Provide initial commercial flags and consent so we don't depend on interactive UI clicks
    render(
      <ContentUploadForm
        onUpload={onUpload}
        selectedPlatforms={["tiktok"]}
        platformOptions={{
          tiktok: {
            privacy: "SELF_ONLY",
            commercial: { isCommercial: true, brandedContent: true },
            consent: true,
          },
        }}
      />
    );

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Branded Test" } });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Now attempt upload and expect an error about branded content visibility
    const uploadBtn = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(uploadBtn);

    // The UI auto-switches privacy from SELF_ONLY -> EVERYONE for branded content and shows a notice
    await screen.findByText(/Branded content cannot be private/i, { timeout: 3000 });
  });

  test("disables preview and upload when creator cannot post", async () => {
    const onUpload = jest.fn(async () => ({}));
    // Mock creator_info fetch to return can_post=false
    const origFetch = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        creator: {
          display_name: "NoPost Creator",
          can_post: false,
          privacy_level_options: ["EVERYONE", "FRIENDS", "SELF_ONLY"],
          interactions: { comments: true, duet: true, stitch: true },
        },
      }),
    }));

    render(<ContentUploadForm onUpload={onUpload} selectedPlatforms={["tiktok"]} />);

    // Wait for the banner to appear
    await screen.findByText(/cannot publish via third-party apps/i, { timeout: 3000 });

    const previewBtn = screen.getByLabelText(/Preview Content/i);
    const uploadBtn = screen.getByRole("button", { name: /Upload Content/i });

    expect(previewBtn).toBeDisabled();
    expect(uploadBtn).toBeDisabled();

    // Restore fetch
    global.fetch = origFetch;
  });

  test("handles structured preview title objects without crashing", async () => {
    const onUpload = jest.fn(async () => ({
      previews: [
        {
          platform: "tiktok",
          title: { original: "origTitle", suggestions: ["s1"] },
          description: { text: "desc" },
          thumbnail: "/img.png",
        },
      ],
    }));

    render(<ContentUploadForm onUpload={onUpload} selectedPlatforms={["tiktok"]} />);

    // Provide minimal fields and a file
    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Preview Obj" } });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Click preview to trigger onUpload
    const previewBtn = screen.getByLabelText(/Preview Content/i);
    fireEvent.click(previewBtn);

    // Expect the preview card to render a stringified title containing "origTitle"
    await screen.findByText(/origTitle/, { timeout: 3000 });
  });

  test("programmatic submit does not trigger upload in production guard", async () => {
    const onUpload = jest.fn(async () => ({}));

    render(<ContentUploadForm onUpload={onUpload} selectedPlatforms={["tiktok"]} />);

    // Simulate programmatic submit (no nativeEvent)
    const form = screen.getByTestId("content-upload-form");
    await fireEvent.submit(form);

    // onUpload should NOT have been called
    expect(onUpload).not.toHaveBeenCalled();
  });

  test("disabled interaction checkboxes include explanatory title attributes", async () => {
    const onUpload = jest.fn(async () => ({}));
    // Mock creator_info fetch to disable comments
    const origFetch2 = global.fetch;
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        creator: {
          display_name: "NoComments",
          can_post: true,
          privacy_level_options: ["EVERYONE", "FRIENDS", "SELF_ONLY"],
          interactions: { comments: false, duet: true, stitch: true },
        },
      }),
    }));

    render(<ContentUploadForm onUpload={onUpload} selectedPlatforms={["tiktok"]} />);

    const commentsCheckbox = await screen.findByLabelText(/Comments/i);
    expect(commentsCheckbox).toHaveAttribute("title", "Comments disabled by creator");

    // Restore fetch
    global.fetch = origFetch2;
  });

  test("commercial disclosure with no options selected disables upload button", async () => {
    const onUpload = jest.fn(async () => ({}));

    render(
      <ContentUploadForm
        onUpload={onUpload}
        selectedPlatforms={["tiktok"]}
        platformOptions={{ tiktok: { consent: true } }}
      />
    );

    fireEvent.click(screen.getByText(/This content is commercial or promotional/i));

    // After toggling commercial on (via the checkbox) but not selecting Your Brand or Branded Content,
    // the upload button should be disabled and a warning should be visible.
    const uploadBtn = screen.getByRole("button", { name: /Upload Content/i });
    await screen.findByText(/You need to indicate if your content promotes yourself/i);
    expect(uploadBtn).toBeDisabled();
  });
});
