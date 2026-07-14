import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import CamCombinerPanel from "../CamCombinerPanel";

let mockLatestCombinerProps;

jest.mock("../../components/MultiCamCombiner", () => props => {
  mockLatestCombinerProps = props;
  return (
    <div>
      <span>Standalone Cam Combiner</span>
      <button type="button" onClick={props.onCancel}>Close workspace</button>
      <button type="button" onClick={() => props.onComplete({ file: { name: "proof.mp4" } })}>
        Use export
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
});
