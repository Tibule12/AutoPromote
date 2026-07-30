import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ClipStudioWorkspace from "../ClipStudioWorkspace";

jest.mock("../FindViralClipsPanel", () => props => (
  <button
    type="button"
    onClick={() => props.onOpenStudio(new File(["video"], "source.mp4"), { id: "moment-1" })}
  >
    Select detected moment
  </button>
));

jest.mock("../ViralClipStudioPanel", () => props => (
  <div>
    <span>Unified editor</span>
    <button type="button" onClick={props.onBack}>
      Back to discovery
    </button>
  </div>
));

describe("ClipStudioWorkspace", () => {
  test("keeps discovery and editing in one Clip Studio route", () => {
    render(<ClipStudioWorkspace />);

    fireEvent.click(screen.getByRole("button", { name: "Select detected moment" }));
    expect(screen.getByText("Unified editor")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to discovery" }));
    expect(screen.getByRole("button", { name: "Select detected moment" })).toBeInTheDocument();
  });
});
