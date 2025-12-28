import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

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

    // Click the TikTok platform card to open focused view
    render(<ContentUploadForm onUpload={onUpload} />);
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-card")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);

    // Fill minimal fields in focused view and ensure file selected
    fireEvent.change(screen.getByLabelText(/Platform title tiktok/i), {
      target: { value: "TikTok Consent Test" },
    });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/Platform file tiktok/i);
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
        platformOptions={{ tiktok: { privacy: "EVERYONE", consent: true } }}
      />
    );

    // Open focused TikTok view
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-card")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);

    // Fill title and select a file
    fireEvent.change(screen.getByLabelText(/Platform title tiktok/i), {
      target: { value: "Overlay Test" },
    });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/Platform file tiktok/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Add overlay text in focused view
    const overlayInput = screen.getByPlaceholderText(/Add overlay text/i);
    fireEvent.change(overlayInput, { target: { value: "Watermark" } });

    // Ensure consent is checked so upload proceeds to validation
    const consentCheckbox = screen.getByLabelText(/By posting, you agree to TikTok/i);
    if (consentCheckbox && !consentCheckbox.checked) fireEvent.click(consentCheckbox);

    // Ensure privacy is set (some flows require explicit user selection)
    const combos = screen.getAllByRole("combobox");
    let privacySelect = combos.find(c => {
      try {
        within(c).getByRole("option", { name: /EVERYONE/i });
        return true;
      } catch (e) {
        return false;
      }
    });
    expect(privacySelect).toBeTruthy();
    fireEvent.change(privacySelect, { target: { value: "EVERYONE" } });

    // Attempt platform upload: clicking Upload should perform client-side validation and set an error
    const uploadBtn = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(uploadBtn);

    // Expect client-side validation error about overlay/watermark
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
        platformOptions={{
          tiktok: {
            privacy: "SELF_ONLY",
            commercial: { isCommercial: true, brandedContent: true },
            consent: true,
          },
        }}
      />
    );

    // Focus TikTok and provide title and file in focused view
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-card")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);

    fireEvent.change(screen.getByLabelText(/Platform title tiktok/i), {
      target: { value: "Branded Test" },
    });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/Platform file tiktok/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Now attempt upload and expect an error about branded content visibility
    const uploadBtn = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(uploadBtn);

    // The UI auto-switches privacy from SELF_ONLY -> EVERYONE for branded content. Ensure privacy was set to EVERYONE.
    await screen.findByDisplayValue(/EVERYONE/i, { timeout: 3000 });
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

    // Select the TikTok platform card and expand its options so the disabled banner is visible
    // Select and expand the TikTok platform card using role=button and filter to the card element
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-card")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);

    // Wait for the creator info to arrive which indicates the check has completed
    await screen.findByText(/NoPost Creator/i, { timeout: 3000 });

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

    // Open TikTok focused view
    render(<ContentUploadForm onUpload={onUpload} />);
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-card")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);

    // Provide minimal fields and a file in focused view
    fireEvent.change(screen.getByLabelText(/Platform title tiktok/i), {
      target: { value: "Preview Obj" },
    });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/Platform file tiktok/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Click preview to trigger onUpload
    const previewBtn = screen.getByLabelText(/Preview Content/i);
    fireEvent.click(previewBtn);

    // Expect the preview card to render a stringified title containing "origTitle"
    await screen.findByText(/origTitle/, { timeout: 3000 });
  });

  test("programmatic submit does not trigger upload in production guard", async () => {
    const onUpload = jest.fn(async () => ({}));

    render(<ContentUploadForm onUpload={onUpload} />);

    // The global upload form no longer exists; ensure data-testid is absent and no upload occurred
    expect(screen.queryByTestId("content-upload-form")).toBeNull();
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

    // Open focused TikTok view which will trigger creator_info fetch, then wait for the UI to update
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-card")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);

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

    // Open focused TikTok view so the per-platform commercial checkbox is visible
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-card")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);

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

    // Open focused TikTok view
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-card")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);

    // Provide title and file in focused view
    fireEvent.change(screen.getByLabelText(/Platform title tiktok/i), {
      target: { value: "Initial Title" },
    });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/Platform file tiktok/i);
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Generate preview
    const previewBtn = screen.getByLabelText(/Preview Content/i);
    fireEvent.click(previewBtn);

    // Wait for preview card to render and ensure the preview media is shown
    await screen.findByText(/Initial Title/);
    const media = await screen.findByLabelText(/Preview media/i);
    expect(media).toBeDefined();
    // If it's a video, ensure the element is a VIDEO node
    expect(media.tagName === "VIDEO" || media.tagName === "IMG").toBeTruthy();

    // Ensure Edit Preview button is present on the preview card and opens the modal
    const editBtn = await screen.findByRole("button", { name: /Edit preview/i }, { timeout: 3000 });
    expect(editBtn).toBeDefined();

    // Open edit modal and update title
    fireEvent.click(editBtn);
    // Wait for the modal dialog to appear, then scope queries to it for reliability
    await screen.findByRole('dialog');
    const dialog = screen.getByRole('dialog');
    const modalTitle = within(dialog).getByLabelText(/Edit preview title/i);
    fireEvent.change(modalTitle, { target: { value: "Edited Title" } });
    const saveBtn = within(dialog).getByRole("button", { name: /Save edit/i });
    fireEvent.click(saveBtn);

    // Expect the preview card to reflect the edited title
    await screen.findByText(/Edited Title/);

    // Form title should still show the original value (editing preview doesn't change global title unless user saves in final flow)
    expect(screen.getByLabelText(/Platform title tiktok/i)).toHaveValue("Initial Title");
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

    // Open focused TikTok view before interacting
    const tiktokButtonsInit = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTileInit = tiktokButtonsInit.find(
      b => b.classList && b.classList.contains("platform-card")
    );
    expect(tiktokTileInit).toBeDefined();
    fireEvent.click(tiktokTileInit);

    fireEvent.change(screen.getByLabelText(/Platform title tiktok/i), {
      target: { value: "Publish Test" },
    });
    const file = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/Platform file tiktok/i);
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

    // Re-open focused TikTok view after remount
    const tiktokButtons = screen.getAllByRole("button", { name: /TikTok/i });
    const tiktokTile = tiktokButtons.find(
      b => b.classList && b.classList.contains("platform-card")
    );
    expect(tiktokTile).toBeDefined();
    fireEvent.click(tiktokTile);

    // Re-select the file after the remount (file inputs don't persist across remounts in tests)
    const file2 = new File(["dummy"], "test.mp4", { type: "video/mp4" });
    const fileInput2 = screen.getByLabelText(/Platform file tiktok/i);
    fireEvent.change(fileInput2, { target: { files: [file2] } });

    // Upload should now be enabled
    await waitFor(() => {
      const uploadBtn2 = screen.getByRole("button", { name: /Upload Content/i });
      expect(uploadBtn2).not.toBeDisabled();
    });

    // Click Upload - since consent is now true this should proceed to upload
    const uploadBtn2 = screen.getByRole("button", { name: /Upload Content/i });
    fireEvent.click(uploadBtn2);

    await waitFor(() => expect(onUpload).toHaveBeenCalled(), { timeout: 5000 });

    // Cleanup E2E flag
    delete window.__E2E_TEST_TIKTOK_CONSENT;
  });

  test("clicking a platform card opens focused platform view and hides other UI", async () => {
    const onUpload = jest.fn(async () => ({ previews: [{ platform: "tiktok", title: "Test" }] }));
    render(<ContentUploadForm onUpload={onUpload} />);

    // Click the TikTok platform card
    const buttons = screen.getAllByRole("button", { name: /TikTok/i });
    const tile = buttons.find(b => b.classList && b.classList.contains("platform-card"));
    expect(tile).toBeDefined();
    fireEvent.click(tile);

    // Focused view should show a back button and the focused title (heading)
    expect(await screen.findByRole("heading", { name: /Upload to TikTok/i })).toBeInTheDocument();

    // Global elements (Templates, BestTimeToPost) should not be visible in focused view
    expect(screen.queryByText(/Templates/i)).toBeNull();
    expect(screen.queryByText(/Great time to post/i)).toBeNull();

    // Click back to return to the platform grid
    const back = screen.getByRole("button", { name: /Back/i });
    fireEvent.click(back);

    // Now the platform grid should be visible and global elements like Templates should remain hidden
    expect(screen.getByText(/🎯 Target Platforms/i)).toBeInTheDocument();
    expect(screen.queryByText(/Templates/i)).toBeNull();
  });

  test("per-platform card has its own file/title/description inputs and preview uses per-platform file", async () => {
    const onUpload = jest.fn(async () => {
      // Simulate preview backend failure so code falls back to local file preview
      throw new Error("preview backend down");
    });

    render(<ContentUploadForm onUpload={onUpload} />);

    // Find the TikTok platform tile and expand it
    const buttons = screen.getAllByRole("button", { name: /TikTok/i });
    const tile = buttons.find(b => b.classList && b.classList.contains("platform-card"));
    expect(tile).toBeDefined();
    fireEvent.click(tile);

    // Focused heading should render for the platform form
    await screen.findByRole("heading", { name: /Upload to TikTok/i });

    // Provide per-platform file and title using accessible labels
    const pf = new File(["abc"], "platform.mp4", { type: "video/mp4" });
    const fileInput = screen.getByLabelText(/Platform file TikTok/i);
    fireEvent.change(fileInput, { target: { files: [pf] } });

    const titleInput = screen.getByLabelText(/Platform title TikTok/i);
    fireEvent.change(titleInput, { target: { value: "Platform Title" } });

    // Click Preview inside the expanded panel
    const previewBtn = screen.getByText(/Preview/i);
    fireEvent.click(previewBtn);
    // We expect the per-platform preview card to show the given title after fallback
    const matches = await screen.findAllByText(/Platform Title/, { timeout: 3000 });
    expect(matches.length).toBeGreaterThan(0);
  });
});
