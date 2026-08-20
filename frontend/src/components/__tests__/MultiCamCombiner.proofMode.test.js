import React from "react";
import { render, screen } from "@testing-library/react";
import MultiCamCombiner from "../MultiCamCombiner";

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

describe("MultiCamCombiner studio layout", () => {
  it("keeps the programme monitor and render controls visible in the main studio", () => {
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

    expect(screen.getByText("Program Output")).toBeInTheDocument();
    expect(screen.getByText("Render Ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Auto Direct Preview only" })).toBeInTheDocument();
    expect(screen.queryByText("Proof Mode")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Compare" })).not.toBeInTheDocument();
  });
});
