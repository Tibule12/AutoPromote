import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import ContentUploadForm from "../ContentUploadForm";

// Increase test timeout for async TikTok flows that involve multiple network-like steps
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

describe("ContentUploadForm TikTok UX enforcement", () => {
  beforeAll(() => jest.setTimeout(20000));

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

    // Attempt platform upload: clicking Upload now opens the Confirm modal, so click through to confirm
    const uploadBtn = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(uploadBtn);

    // Confirm modal appears; confirm to trigger validation
    const confirmBtn = await screen.findByRole("button", { name: /Confirm\s*&?\s*Publish/i });
    // Ensure consent is checked (E2E flag may be set) otherwise check it
    // Find the consent checkbox inside the modal by label to avoid collisions with other checkboxes
    const consentCheckbox = screen.getByLabelText(
      /I explicitly consent to publish this content to TikTok/i
    );
    if (consentCheckbox && !consentCheckbox.checked) fireEvent.click(consentCheckbox);

    fireEvent.click(confirmBtn);

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

    // Select the TikTok platform tile and expand its options so the disabled banner is visible
    // Select and expand the TikTok platform tile using role=button and filter to the tile element
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-tile")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);
    // Click the Edit button inside the selected tile to expand platform options
    const { within } = require("@testing-library/react");
    const editBtn = within(tiktokTile).getByText(/Edit/i);
    fireEvent.click(editBtn);

    // Wait for the banner to appear inside the expanded area
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

    // Select and expand TikTok options so the UI fetches creator_info and disables interactions
    // Find the TikTok platform tile (filter among multiple matches) and expand it
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-tile")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);
    const { within } = require("@testing-library/react");
    const editBtn = within(tiktokTile).getByText(/Edit/i);
    fireEvent.click(editBtn);

    await waitFor(async () => {
      const commentsCheckboxes = await screen.findAllByLabelText(/Comments/i);
      const commentsCheckbox = commentsCheckboxes.find(
        cb => cb.getAttribute("title") === "Comments disabled by creator"
      );
      expect(commentsCheckbox).toBeDefined();
    });

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

  test("opens Preview Edit modal and applies edits to form and preview card", async () => {
    const onUpload = jest.fn(async payload => ({
      previews: [{ platform: "tiktok", title: payload.title, description: payload.description }],
    }));

    render(<ContentUploadForm onUpload={onUpload} selectedPlatforms={["tiktok"]} />);

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Initial Title" } });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Generate preview
    const previewBtn = screen.getByLabelText(/Preview Content/i);
    fireEvent.click(previewBtn);

    // Wait for preview card to render
    await screen.findByText(/Initial Title/);

    // Click Edit Preview on the preview card
    const editBtn = screen.getByRole("button", { name: /Edit preview/i });
    fireEvent.click(editBtn);

    // Change title in modal and save
    const editTitleInput = screen.getByLabelText(/Edit preview title/i);
    fireEvent.change(editTitleInput, { target: { value: "Edited Title" } });

    const saveBtn = screen.getByRole("button", { name: /Save edit/i });
    fireEvent.click(saveBtn);

    // Form title should update and preview card should show edited title
    expect(screen.getByLabelText(/Title/i)).toHaveValue("Edited Title");
    await screen.findByText(/Edited Title/);
  });

  test("Confirm modal requires TikTok consent before calling onUpload", async () => {
    const onUpload = jest.fn(async () => ({}));

    // First, verify Upload is disabled when consent is false
    const { rerender } = render(
      <ContentUploadForm
        onUpload={onUpload}
        selectedPlatforms={["tiktok"]}
        platformOptions={{ tiktok: { consent: false } }}
      />
    );

    fireEvent.change(screen.getByLabelText(/Title/i), { target: { value: "Publish Test" } });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    const uploadBtn = screen.getByRole("button", { name: /Upload Content/i });
    expect(uploadBtn).toBeDisabled();

    // Now simulate the user giving consent and re-rendering (or use E2E flag)
    window.__E2E_TEST_TIKTOK_CONSENT = true;
    // force remount so component picks up the flag; provide consent true and privacy to simulate user consent
    rerender(
      <ContentUploadForm
        key="re-mount"
        onUpload={onUpload}
        selectedPlatforms={["tiktok"]}
        platformOptions={{ tiktok: { consent: true, privacy: "EVERYONE" } }}
      />
    );

    // Re-select the file after the remount (file inputs don't persist across remounts in tests)
    const file2 = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput2 = screen.getByLabelText(/File/i);
    fireEvent.change(fileInput2, { target: { files: [file2] } });

    // Upload should now be enabled
    await waitFor(() => {
      const uploadBtn2 = screen.getByRole("button", { name: /Upload Content/i });
      expect(uploadBtn2).not.toBeDisabled();
    });

    // Click Upload to open confirm modal and assert confirm button exists
    const uploadBtn2 = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(uploadBtn2);
    const confirmBtn = await screen.findByRole("button", { name: /Confirm\s*&?\s*Publish/i });
    // Since E2E flag auto-checks consent, confirm should be enabled
    expect(confirmBtn).not.toBeDisabled();

    // Click confirm - should trigger the upload flow and call onUpload eventually
    fireEvent.click(confirmBtn);

    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 5000 });

    // Cleanup E2E flag
    delete window.__E2E_TEST_TIKTOK_CONSENT;
  });
});
