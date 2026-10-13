import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { uploadSourceFileViaBackend } from "../../utils/sourceUpload";
import ViralClipStudioPanel from "../ViralClipStudioPanel";
import * as projectStore from "../../components/viralStudioProjectStore";
import { adaptStudioSnapshotToDocument } from "../../components/studioProjectDocument";

const mockVideoEditor = jest.fn();
const mockGetIdToken = jest.fn();
let mockSubscriptionLoading = false;
let mockStudioAllowed = true;

jest.mock("../../hooks/useSubscription", () => ({
  useSubscription: () => ({ canUseFeature: () => mockStudioAllowed, loading: mockSubscriptionLoading }),
}));

jest.mock("../../utils/sourceUpload", () => ({
  uploadSourceFileViaBackend: jest.fn(),
}));

jest.mock("firebase/auth", () => ({
  getAuth: () => ({
    currentUser: { getIdToken: mockGetIdToken },
  }),
}));

jest.mock("../../components/VideoEditor", () => props => {
  mockVideoEditor(props);
  return <div>Real Viral Clip Studio controller</div>;
});

describe("ViralClipStudioPanel", () => {
  const backupFile = () => {
    const id = "viral-project-backup-proof";
    const snapshot = {
      orderedClips: [{ id: "source", start: 0, end: 12, duration: 12 }], selectedClipId: "source",
      timeline: [{ id: "main", sourceClipId: "source", storagePath: "uploads/videos/user/source.mp4",
        url: "https://example.com/source.mp4", startRequest: 0, endRequest: 12, duration: 12 }],
      projectMedia: [{ id: "source", storagePath: "uploads/videos/user/source.mp4", duration: 12 }],
      soundEffects: [{ id: "cue", storagePath: "uploads/audio/user/sound.wav", name: "Impact", startTime: 2, duration: 1 }],
      overlays: [], motionScenes: [], threeDScenes: [],
    };
    snapshot.studioDocument = adaptStudioSnapshotToDocument({ snapshot, projectId: id });
    const project = { id, name: "Recovered edit", snapshot, versions: [] };
    const file = new File([JSON.stringify(project)], "project.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => JSON.stringify(project) });
    return { file, project };
  };
  beforeEach(() => {
    mockSubscriptionLoading = false;
    mockStudioAllowed = true;
    mockVideoEditor.mockClear();
    mockGetIdToken.mockReset();
    mockGetIdToken.mockResolvedValue("firebase-token");
    uploadSourceFileViaBackend.mockReset();
    uploadSourceFileViaBackend.mockResolvedValue({
      url: "https://storage.example/source.mp4",
      storagePath: "uploads/videos/user/source.mp4",
      size: 5,
    });
  });

  test("backup restore authorizes every owned media path before saving the unchanged canonical edit", async () => {
    const { file, project } = backupFile();
    const listing = jest.spyOn(projectStore, "listViralStudioProjects").mockResolvedValue([]);
    const saving = jest.spyOn(projectStore, "saveViralStudioProject").mockResolvedValue(project);
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://media.example.com/owned" }) });
    try {
      render(<ViralClipStudioPanel />);
      fireEvent.change(screen.getByLabelText("Restore project backup"), { target: { files: [file] } });
      await waitFor(() => expect(saving).toHaveBeenCalledWith(project));
      expect(global.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).storagePath).sort())
        .toEqual(["uploads/audio/user/sound.wav", "uploads/videos/user/source.mp4"]);
    } finally { listing.mockRestore(); saving.mockRestore(); global.fetch = originalFetch; }
  });

  test("backup restore rejects inaccessible media without writing any project", async () => {
    const { file } = backupFile();
    const listing = jest.spyOn(projectStore, "listViralStudioProjects").mockResolvedValue([]);
    const saving = jest.spyOn(projectStore, "saveViralStudioProject").mockResolvedValue({});
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ message: "This source belongs to another account." }) });
    try {
      render(<ViralClipStudioPanel />);
      fireEvent.change(screen.getByLabelText("Restore project backup"), { target: { files: [file] } });
      await screen.findByText("This source belongs to another account.");
      expect(saving).not.toHaveBeenCalled();
    } finally { listing.mockRestore(); saving.mockRestore(); global.fetch = originalFetch; }
  });

  test("backup restore cannot overwrite a newer saved project", async () => {
    const { file, project } = backupFile();
    const listing = jest.spyOn(projectStore, "listViralStudioProjects").mockResolvedValue([project]);
    const saving = jest.spyOn(projectStore, "saveViralStudioProject").mockResolvedValue({});
    try {
      render(<ViralClipStudioPanel />);
      fireEvent.change(screen.getByLabelText("Restore project backup"), { target: { files: [file] } });
      await screen.findByText("This project is already saved. Open its saved entry.");
      expect(saving).not.toHaveBeenCalled();
    } finally { listing.mockRestore(); saving.mockRestore(); }
  });

  test("a saved project waits for the paid profile instead of redirecting to Billing", async () => {
    const project = { id: "saved-edit", name: "Saved edit", snapshot: { projectMedia: [
      { name: "source.mp4", duration: 12, storagePath: "uploads/videos/user/source.mp4" }
    ] } };
    const listing = jest.spyOn(projectStore, "listViralStudioProjects").mockResolvedValue([project]);
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "https://media.example.com/source.mp4" }) });
    mockSubscriptionLoading = true; mockStudioAllowed = false;
    const onUpgrade = jest.fn();
    try {
      const view = render(<ViralClipStudioPanel onUpgrade={onUpgrade} />);
      const button = await screen.findByRole("button", { name: "Saved edit" });
      expect(button).toBeDisabled(); fireEvent.click(button);
      expect(onUpgrade).not.toHaveBeenCalled();
      mockSubscriptionLoading = false; mockStudioAllowed = true;
      view.rerender(<ViralClipStudioPanel onUpgrade={onUpgrade} />);
      expect(button).toBeEnabled(); fireEvent.click(button);
      await screen.findByText("Real Viral Clip Studio controller");
      expect(mockVideoEditor.mock.calls.at(-1)[0].initialSavedProject).toEqual(project);
      expect(onUpgrade).not.toHaveBeenCalled();
    } finally { listing.mockRestore(); global.fetch = originalFetch; }
  });

  test("uploads and validates the source before opening the original Studio controller", async () => {
    const source = new File(["video"], "source.mp4", { type: "video/mp4" });
    const clip = { id: "clip-1", start: 4, end: 24, score: 91 };
    const { container } = render(
      <ViralClipStudioPanel initialFile={source} initialClip={clip} onOpenPublisher={() => {}} />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Uploading video");
    expect(screen.queryByRole("button", { name: /open creator studio/i })).not.toBeInTheDocument();

    await waitFor(() =>
      expect(uploadSourceFileViaBackend).toHaveBeenCalledWith(
        expect.objectContaining({
          file: source,
          token: "firebase-token",
          mediaType: "video",
          fileName: "source.mp4",
        })
      )
    );

    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    const preview = container.querySelector("video");
    Object.defineProperty(preview, "duration", { configurable: true, value: 20 });
    fireEvent.loadedMetadata(preview);

    const openButton = await screen.findByRole("button", { name: /^open creator studio$/i });
    await waitFor(() => expect(openButton).toBeEnabled());
    fireEvent.click(openButton);

    expect(screen.getByText("Real Viral Clip Studio controller")).toBeInTheDocument();
    const studioFile = mockVideoEditor.mock.calls.at(-1)[0].file;
    expect(studioFile).toEqual(
      expect.objectContaining({
        name: "source.mp4",
        url: "https://storage.example/source.mp4",
        storagePath: "uploads/videos/user/source.mp4",
        isRemote: true,
        openStudio: true,
      })
    );
    expect(studioFile.clips).toEqual([
      expect.objectContaining({ id: "clip-1", start: 4, end: 24, viralScore: 91 }),
    ]);
  });

  test("accepts a dropped video through the same authenticated upload flow", async () => {
    const source = new File(["video"], "dropped.mp4", { type: "video/mp4" });
    const { container } = render(<ViralClipStudioPanel />);
    fireEvent.drop(container.querySelector(".creator-studio-dropzone"), {
      dataTransfer: { files: [source] },
    });
    await waitFor(() => expect(uploadSourceFileViaBackend).toHaveBeenCalledWith(
      expect.objectContaining({ file: source, token: "firebase-token", mediaType: "video" })
    ));
    expect(screen.getByRole("status")).toHaveTextContent("Validating preview");
  });

  test("stages additional selected videos for Studio's project library", async () => {
    const first = new File(["first"], "scene-1.mp4", { type: "video/mp4" });
    const second = new File(["second"], "scene-2.mp4", { type: "video/mp4" });
    const third = new File(["third"], "camera-b.mp4", { type: "video/mp4" });
    const { container } = render(<ViralClipStudioPanel />);

    fireEvent.change(container.querySelector('input[type="file"][accept="video/*"]'), {
      target: { files: [first, second, third] },
    });

    await waitFor(() => expect(uploadSourceFileViaBackend).toHaveBeenCalledWith(
      expect.objectContaining({ file: first, purpose: "studio_source" })
    ));
    expect(uploadSourceFileViaBackend).toHaveBeenCalledTimes(1);
    const preview = await waitFor(() => {
      const video = container.querySelector("video");
      expect(video).not.toBeNull();
      return video;
    });
    Object.defineProperty(preview, "duration", { configurable: true, value: 12 });
    fireEvent.loadedMetadata(preview);
    expect(await screen.findByText(/2 more videos will import/i)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /^open creator studio$/i }));

    expect(mockVideoEditor.mock.calls.at(-1)[0].initialProjectFiles).toEqual([second, third]);
  });

  test("keeps Studio blocked and shows the upload failure", async () => {
    uploadSourceFileViaBackend.mockRejectedValueOnce(
      new Error("Upload service returned no HTTP response.")
    );
    const source = new File(["video"], "source.mp4", { type: "video/mp4" });

    render(
      <ViralClipStudioPanel initialFile={source} initialClip={null} onOpenPublisher={() => {}} />
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Upload service returned no HTTP response."
    );
    expect(screen.queryByRole("button", { name: /^open creator studio$/i })).not.toBeInTheDocument();
    expect(mockVideoEditor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Retry Upload" }));
    await waitFor(() => expect(uploadSourceFileViaBackend).toHaveBeenCalledTimes(2));
    expect(uploadSourceFileViaBackend.mock.calls[1][0].file).toBe(source);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Validating preview"));
  });
});
