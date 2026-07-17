import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CamCombinerPanel from "../CamCombinerPanel";

let mockLatestCombinerProps;

jest.mock("../../components/MultiCamCombiner", () => props => {
  mockLatestCombinerProps = props;
  return (
    <div>
      <span>Standalone Cam Combiner</span>
      <button type="button" onClick={props.onCancel}>
        Close workspace
      </button>
      <button type="button" onClick={() => props.onComplete({ file: { name: "proof.mp4" } })}>
        Use export
      </button>
      <button
        type="button"
        onClick={() =>
          props.onFindViralClips({ renderJobId: "job-1", url: "https://cdn/master.mp4" })
        }
      >
        Find viral clips
      </button>
    </div>
  );
});

describe("CamCombinerPanel", () => {
  it("opens without requiring an initial upload", () => {
    render(<CamCombinerPanel onClose={() => {}} onUseExport={() => {}} />);

    expect(screen.getByText("Standalone Cam Combiner")).toBeInTheDocument();
    expect(mockLatestCombinerProps.primaryFile).toBeNull();
  });

  it("returns to the dashboard and forwards completed exports", () => {
    const onClose = jest.fn();
    const onUseExport = jest.fn();
    render(<CamCombinerPanel onClose={onClose} onUseExport={onUseExport} />);

    fireEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Use export" }));
    expect(onUseExport).toHaveBeenCalledWith({ file: { name: "proof.mp4" } });
  });

  it("forwards a saved master into Find Viral Clips", () => {
    const onFindViralClips = jest.fn();
    render(
      <CamCombinerPanel
        onClose={() => {}}
        onUseExport={() => {}}
        onFindViralClips={onFindViralClips}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Find viral clips" }));
    expect(onFindViralClips).toHaveBeenCalledWith({
      renderJobId: "job-1",
      url: "https://cdn/master.mp4",
    });
  });
});
