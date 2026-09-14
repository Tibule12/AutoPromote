import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import AudioRemixPanel from "./AudioRemixPanel";
import { DEFAULT_AUDIO_REMIX } from "./audioRemixModel";

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
});
