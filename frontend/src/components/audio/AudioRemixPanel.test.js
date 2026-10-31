import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AudioRemixPanel from "./AudioRemixPanel";
import { DEFAULT_AUDIO_REMIX, applyAudioRemixPreset } from "./audioRemixModel";

describe("AudioRemixPanel", () => {
  test("renders the approved controls and activates Slowed + Reverb", () => {
    const onChange = jest.fn();
    render(
      <AudioRemixPanel
        value={DEFAULT_AUDIO_REMIX}
        onChange={onChange}
        bypass={false}
        onBefore={jest.fn()}
        onPreview={jest.fn()}
        hasMusic
        meter={{ peakDb: -4, rmsDb: -12, clipping: false }}
        onToggleLoop={jest.fn()}
      />
    );

    expect(screen.getByRole("region", { name: "Remix Audio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Slowed \+ Reverb/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Amapiano Space/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Bass equalizer")).toBeInTheDocument();
    expect(screen.getByLabelText("Keep Pitch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voice" })).toBeInTheDocument();
    expect(screen.getByLabelText("Output gain")).toBeInTheDocument();
    expect(screen.getByLabelText("Level Match")).toBeChecked();
    expect(screen.getByRole("button", { name: /Loop 8s/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Remix export quality")).toHaveValue("studio");

    fireEvent.click(screen.getByRole("button", { name: /Slowed \+ Reverb/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, preset: "slowed_reverb", speed: 0.82 })
    );
  });

  test("shows worker rendering and exact-preview confirmation states", () => {
    const props = {
      value: applyAudioRemixPreset("warm_vocal"),
      onChange: jest.fn(),
      bypass: false,
      onBefore: jest.fn(),
      onPreview: jest.fn(),
      onToggleLoop: jest.fn(),
    };
    const { rerender } = render(<AudioRemixPanel {...props} exactPreviewStatus="rendering" />);
    expect(screen.getByRole("button", { name: /Rendering exact 8s/i })).toBeDisabled();

    rerender(<AudioRemixPanel {...props} exactPreviewStatus="ready" />);
    expect(screen.getByRole("button", { name: /Replay Exact Preview/i })).toBeEnabled();
    expect(screen.getByText(/final FFmpeg mastering chain/i)).toBeInTheDocument();
  });

  test("selects the Chipmunk voice and offers its exact preview", () => {
    const onChange = jest.fn();
    const onPreview = jest.fn();
    const props = { onChange, onPreview, onBefore: jest.fn(), onToggleLoop: jest.fn() };
    const { rerender } = render(<AudioRemixPanel {...props} value={DEFAULT_AUDIO_REMIX} />);
    fireEvent.click(screen.getByTestId("audio-remix-preset-chipmunk"));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      enabled: true, preset: "chipmunk", pitch: 12, speed: 1, target: "voice", keepPitch: false,
    }));
    rerender(<AudioRemixPanel {...props} value={onChange.mock.calls[0][0]} />);
    expect(screen.getByTestId("audio-remix-preset-chipmunk")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/hear the Chipmunk voice/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Preview Remix/ }));
    expect(onPreview).toHaveBeenCalledTimes(1);
  });
});
