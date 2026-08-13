import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import MultiCamCombiner, {
  buildCamCombinerProofMoments,
  getCamCombinerProofReceipt,
} from "../MultiCamCombiner";

jest.mock("firebase/auth", () => ({
  getAuth: () => ({ currentUser: null }),
}));

jest.mock("firebase/storage", () => ({
  getStorage: jest.fn(),
  ref: jest.fn(),
  uploadBytesResumable: jest.fn(),
  getDownloadURL: jest.fn(),
}));

jest.mock("react-hot-toast", () => ({
  error: jest.fn(),
  success: jest.fn(),
}));

jest.mock("../../hooks/useSubscription", () => ({
  useSubscription: () => ({
    canUseFeature: () => true,
    credits: { remaining: 999 },
  }),
}));

jest.mock("../../hooks/useCinematicEffects", () => () => ({
  fx: { zoom: 1 },
  showPanel: false,
  setShowPanel: jest.fn(),
  applyPreset: jest.fn(),
  updateFx: jest.fn(),
  resetFx: jest.fn(),
  mediaStyle: {},
  edgeBlurStyle: null,
  vignetteStyle: null,
  overlayStyle: null,
  grainStyle: null,
  letterboxStyle: null,
  fadeStyle: null,
  hasEffects: false,
  attachVideo: jest.fn(),
}));

describe("MultiCamCombiner Proof Mode helpers", () => {
  it("opens in Compare and keeps paid render controls behind an explicit review action", () => {
    render(
      <MultiCamCombiner
        primaryFile={{
          url: "https://cdn.example.com/camera-one.jpg",
          isRemote: true,
          name: "camera-one.jpg",
          type: "image/jpeg",
        }}
        onCancel={jest.fn()}
        onComplete={jest.fn()}
        onStatusChange={jest.fn()}
      />
    );

    expect(screen.getByText("Proof Mode")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Compare" })).toHaveAttribute("aria-pressed", "true");

    const renderSummary = screen.getByRole("button", { name: /ready when you are/i });
    expect(renderSummary).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(renderSummary);
    expect(renderSummary).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Raw" }));
    expect(screen.getByRole("button", { name: "Raw" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses real switch timestamps for the transformation moment rail", () => {
    const moments = buildCamCombinerProofMoments(
      [
        { startTime: 0, cameraId: "cam-1" },
        { startTime: 8, cameraId: "cam-2" },
        { startTime: 22, cameraId: "cam-1" },
        { startTime: 44, cameraId: "cam-2" },
      ],
      60
    );

    expect(moments).toEqual([
      expect.objectContaining({ id: "speaker-cut", label: "Speaker cut", time: 8 }),
      expect.objectContaining({ id: "reaction-caught", label: "Reaction caught", time: 22 }),
      expect.objectContaining({ id: "shared-moment", label: "Shared moment", time: 44 }),
    ]);
  });

  it("falls back to useful points in the timeline and never exceeds its duration", () => {
    expect(buildCamCombinerProofMoments([], 100).map(moment => moment.time)).toEqual([24, 52, 76]);
    expect(buildCamCombinerProofMoments([{ startTime: 0 }, { startTime: 999 }], 30)).toEqual(
      expect.arrayContaining([expect.objectContaining({ time: 30 })])
    );
    expect(buildCamCombinerProofMoments([], 0)).toEqual([]);
  });

  it("reports only the current cut, reaction, audio, and sync state", () => {
    expect(
      getCamCombinerProofReceipt({
        switches: [{ startTime: 0 }, { startTime: 8 }, { startTime: 22 }],
        reactionOverlayEnabled: true,
        hasExternalCleanAudio: true,
        syncTone: "good",
      })
    ).toEqual([
      { id: "cuts", value: "3 camera cuts" },
      { id: "reactions", value: "Smart reactions" },
      { id: "audio", value: "Clean audio" },
      { id: "sync", value: "Sync locked" },
    ]);

    expect(getCamCombinerProofReceipt()).toEqual([
      { id: "cuts", value: "0 camera cuts" },
      { id: "reactions", value: "Reactions off" },
      { id: "audio", value: "Camera audio" },
      { id: "sync", value: "Sync pending" },
    ]);
  });
});
