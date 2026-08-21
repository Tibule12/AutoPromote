import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { uploadSourceFileViaBackend } from "../../utils/sourceUpload";
import ViralClipStudioPanel from "../ViralClipStudioPanel";

const mockVideoEditor = jest.fn();
const mockGetIdToken = jest.fn();

jest.mock("../../hooks/useSubscription", () => ({
  useSubscription: () => ({ canUseFeature: () => true }),
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
  beforeEach(() => {
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

  test("uploads and validates the source before opening the original Studio controller", async () => {
    const source = new File(["video"], "source.mp4", { type: "video/mp4" });
    const clip = { id: "clip-1", start: 4, end: 24, score: 91 };
    const { container } = render(
      <ViralClipStudioPanel initialFile={source} initialClip={clip} onOpenPublisher={() => {}} />
    );

    const openButton = screen.getByRole("button", { name: /^open clip studio$/i });
    expect(openButton).toBeDisabled();

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

    await waitFor(() => expect(openButton).toBeEnabled());
    fireEvent.click(openButton);

    expect(screen.getByText("Real Viral Clip Studio controller")).toBeInTheDocument();
    const studioFile = mockVideoEditor.mock.calls.at(-1)[0].file;
    expect(studioFile).toEqual(
      expect.objectContaining({
        name: "source.mp4",
        url: "https://storage.example/source.mp4",
        isRemote: true,
        openStudio: true,
      })
    );
    expect(studioFile.clips).toEqual([
      expect.objectContaining({ id: "clip-1", start: 4, end: 24, viralScore: 91 }),
    ]);
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
    expect(screen.getByRole("button", { name: /^open clip studio$/i })).toBeDisabled();
    expect(mockVideoEditor).not.toHaveBeenCalled();
  });
});
