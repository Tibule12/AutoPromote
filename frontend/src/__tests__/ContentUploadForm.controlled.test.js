import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ContentUploadForm from "../ContentUploadForm";

describe("ContentUploadForm controlled mode", () => {
  test("toggles platform selection via external setter", () => {
    const setSelectedPlatforms = jest.fn();
    render(
      <ContentUploadForm
        onUpload={async () => {}}
        selectedPlatforms={["youtube"]}
        setSelectedPlatforms={setSelectedPlatforms}
      />
    );
    const youtubeTile = screen.getByLabelText(/YouTube/i);
    expect(youtubeTile).toBeInTheDocument();
    // Toggle off via keyboard
    fireEvent.keyDown(youtubeTile, { key: " ", code: "Space", charCode: 32 });
    expect(setSelectedPlatforms).toHaveBeenCalled();
  });

  test("calls setPlatformOption when platform option changes", async () => {
    const setPlatformOption = jest.fn();
    // Start with empty selection so we can click to select & focus (opening the form)
    render(
      <ContentUploadForm
        onUpload={async () => {}}
        selectedPlatforms={[]}
        setPlatformOption={setPlatformOption}
      />
    );

    // Click Discord to select it and trigger focused view
    const discordTile = screen.getByLabelText(/Discord/i);
    fireEvent.click(discordTile);

    // Now the form should appear
    const channelInputs = await screen.findAllByPlaceholderText(/Channel ID/i);
    const discordInput = channelInputs[0];

    fireEvent.change(discordInput, { target: { value: "12345" } });
    expect(setPlatformOption).toHaveBeenCalledWith("discord", "channelId", "12345");
  });

  test.skip("show dragging visual on drop-zone drag events", () => {
    render(<ContentUploadForm onUpload={async () => {}} />);
    const drop = screen.getByTestId("drop-zone");
    expect(drop).toBeInTheDocument();
    fireEvent.dragEnter(drop);
    expect(drop).toHaveClass("dragging");
    fireEvent.dragLeave(drop);
    expect(drop).not.toHaveClass("dragging");
  });
});

export {};
