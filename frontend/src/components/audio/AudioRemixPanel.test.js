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
      />
    );

    expect(screen.getByRole("region", { name: "Remix Audio" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Slowed \+ Reverb/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Amapiano Space/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Bass equalizer")).toBeInTheDocument();
    expect(screen.getByLabelText("Keep Pitch")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Slowed \+ Reverb/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, preset: "slowed_reverb", speed: 0.82 })
    );
  });
});
