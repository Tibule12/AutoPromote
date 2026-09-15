import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  DEFAULT_CREATOR_PREVIEW,
  StudioCreatorPreviewLayer,
  StudioCreatorWorkbench,
  getCreatorCanvasClass,
} from "../StudioCreatorWorkbench";

function WorkbenchHarness() {
  const [value, setValue] = useState(DEFAULT_CREATOR_PREVIEW);
  return (
    <>
      <StudioCreatorWorkbench value={value} onChange={setValue} />
      <StudioCreatorPreviewLayer value={value} source="https://example.com/clip.mp4" time={2} playing={false} />
    </>
  );
}

describe("StudioCreatorWorkbench frontend proof controls", () => {
  test("adds the selected zoom amount as timeline automation, without a second CSS preview", () => {
    const onChange = jest.fn();
    const onApplyMotionPreset = jest.fn();
    render(<StudioCreatorWorkbench value={{ ...DEFAULT_CREATOR_PREVIEW, section: "motion", zoom: 1.76 }} onChange={onChange} onApplyMotionPreset={onApplyMotionPreset} />);
    fireEvent.click(screen.getByTestId("creator-demo-crash_zoom"));
    expect(onApplyMotionPreset).toHaveBeenCalledWith("crash_zoom", 1.76);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("does not manufacture angles to fill a montage", () => {
    const { container } = render(<StudioCreatorPreviewLayer value={{ ...DEFAULT_CREATOR_PREVIEW, activeDemo: "reaction_montage" }} source="https://example.com/programme.mp4" reactionSources={["https://example.com/programme.mp4"]} time={2} playing={false} />);
    expect(container.querySelectorAll("video")).toHaveLength(1);
    expect(screen.queryByText("REACTION")).not.toBeInTheDocument();
  });
  test("does not invent speaker identity and inserts reviewed lower thirds", () => {
    expect(DEFAULT_CREATOR_PREVIEW.name).toBe("");
    expect(DEFAULT_CREATOR_PREVIEW.role).toBe("");
    const onInsertTitle = jest.fn();
    render(<StudioCreatorWorkbench
      value={{ ...DEFAULT_CREATOR_PREVIEW, section: "intros", name: "Nandi", role: "Editor" }}
      onChange={jest.fn()} onInsertTitle={onInsertTitle}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Add editable lower third to timeline" }));
    expect(onInsertTitle).toHaveBeenCalledWith({ preset: "lower_third", text: "Nandi\nEditor" });
  });

  test("clears the active browser preview without removing the editor state", () => {
    const onChange = jest.fn();
    render(
      <StudioCreatorWorkbench
        value={{ ...DEFAULT_CREATOR_PREVIEW, activeDemo: "quote" }}
        onChange={onChange}
      />
    );
    fireEvent.click(screen.getByTestId("creator-clear-preview"));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ activeDemo: "", enabled: true })
    );
  });

  test("applies contextual graphics to the real preview layer", () => {
    render(<WorkbenchHarness />);
    fireEvent.click(screen.getByTestId("creator-section-context"));
    fireEvent.click(screen.getByTestId("creator-demo-contextual_logos"));
    const layer = screen.getByTestId("studio-creator-preview-layer");
    expect(layer).toHaveAttribute("data-active-demo", "contextual_logos");
    expect(screen.queryByText("Brand A")).not.toBeInTheDocument();
    expect(screen.getByText("Import your logo in Visual layers")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Contextual graphic value"), { target: { value: "Client logo" } });
    expect(layer).toHaveTextContent("Client logo");
  });

  test("labels heavy compositing as a preview proxy and makes it visible", () => {
    render(<WorkbenchHarness />);
    fireEvent.click(screen.getByTestId("creator-section-composite"));
    fireEvent.click(screen.getByTestId("creator-demo-censor"));
    expect(screen.getByText(/do not claim that AI tracking/i)).toBeInTheDocument();
    expect(screen.getByTestId("studio-creator-preview-layer")).toHaveAttribute(
      "data-active-demo",
      "censor"
    );
    expect(screen.getByText("PRIVACY BLUR")).toBeInTheDocument();
  });

  test("does not claim an AI suggestion is transcript-grounded without reviewed evidence", () => {
    render(
      <StudioCreatorWorkbench
        value={{ ...DEFAULT_CREATOR_PREVIEW, section: "assist" }}
        onChange={jest.fn()}
      />
    );
    expect(screen.getByText("Evidence required")).toBeInTheDocument();
    expect(screen.getByText(/will not invent transcript evidence/i)).toBeInTheDocument();
  });

  test("shows only the reviewed caption line as director evidence", () => {
    render(
      <StudioCreatorWorkbench
        value={{ ...DEFAULT_CREATOR_PREVIEW, section: "assist" }}
        onChange={jest.fn()}
        transcriptEvidence="This property has three bedrooms and a private garden."
      />
    );
    expect(screen.getByText("Reviewed transcript evidence")).toBeInTheDocument();
    expect(
      screen.getByText("“This property has three bedrooms and a private garden.”")
    ).toBeInTheDocument();
  });

  test("maps creator zoom and shake choices onto the programme canvas", () => {
    expect(getCreatorCanvasClass({ ...DEFAULT_CREATOR_PREVIEW, activeDemo: "punch_zoom" })).toBe(
      "creator-canvas-punch"
    );
    expect(getCreatorCanvasClass({ ...DEFAULT_CREATOR_PREVIEW, activeDemo: "shake" })).toBe(
      "creator-canvas-shake"
    );
    expect(getCreatorCanvasClass({ ...DEFAULT_CREATOR_PREVIEW, activeDemo: "parallax" })).toBe(
      "creator-canvas-parallax"
    );
  });

  test("uses distinct clean camera sources for a reaction montage", () => {
    const { container } = render(
      <StudioCreatorPreviewLayer
        value={{ ...DEFAULT_CREATOR_PREVIEW, activeDemo: "reaction_montage" }}
        source="https://example.com/programme.mp4"
        reactionSources={[
          "https://example.com/speaker-a.mp4",
          "https://example.com/speaker-b.mp4",
        ]}
        time={2}
        playing={false}
      />
    );
    expect(
      [...container.querySelectorAll(".creator-reaction-montage video")].map(video => video.src)
    ).toEqual([
      "https://example.com/speaker-a.mp4",
      "https://example.com/speaker-b.mp4",
      "https://example.com/programme.mp4",
    ]);
  });
});
