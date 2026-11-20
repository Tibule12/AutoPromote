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

    expect(screen.getByText("Uploaded recordings")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open empty editor" }));
    expect(screen.getByText("Standalone Cam Combiner")).toBeInTheDocument();
    expect(mockLatestCombinerProps.primaryFile).toBeNull();
  });

  it("returns to the dashboard and forwards completed exports", () => {
    const onClose = jest.fn();
    const onUseExport = jest.fn();
    render(<CamCombinerPanel onClose={onClose} onUseExport={onUseExport} />);

    fireEvent.click(screen.getByRole("button", { name: "Open empty editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    expect(screen.getByText("Uploaded recordings")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to Overview" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Open empty editor" }));
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

    fireEvent.click(screen.getByRole("button", { name: "Open empty editor" }));
    fireEvent.click(screen.getByRole("button", { name: "Find viral clips" }));
    expect(onFindViralClips).toHaveBeenCalledWith({
      renderJobId: "job-1",
      url: "https://cdn/master.mp4",
    });
  });
  it("passes every selected recording and setup control to the same full editor", () => {
    render(<CamCombinerPanel />);
    const camera = new File(["camera"], "interview.mp4", { type: "video/mp4" });
    const audio = new File(["audio"], "recorder.wav", { type: "audio/wav" });
    fireEvent.change(screen.getByLabelText("Camera 2 recording"), { target: { files: [camera] } });
    fireEvent.change(screen.getByLabelText("Master audio recording"), {
      target: { files: [audio] },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /Speaker detection/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Reaction shots/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Use master audio/ }));
    fireEvent.change(screen.getByLabelText("Minimum shot length"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Render treatment"), { target: { value: "studio" } });
    fireEvent.click(screen.getByRole("button", { name: /Start Auto Edit/ }));
    expect(mockLatestCombinerProps.initialFiles).toEqual([camera]);
    expect(mockLatestCombinerProps.initialExternalAudio).toBe(audio);
    expect(mockLatestCombinerProps.initialSettings).toEqual({
      speakerDetection: false,
      reactionShots: false,
      useMasterAudio: false,
      minimumShotLengthSeconds: 8,
      renderTier: "studio",
    });
  });

  it("keeps an empty entry empty and preserves selected setup files when returning", () => {
    render(<CamCombinerPanel />);
    const camera = new File(["camera"], "camera.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Camera 1 recording"), { target: { files: [camera] } });
    fireEvent.click(screen.getByRole("button", { name: "Open empty editor" }));
    expect(mockLatestCombinerProps.initialFiles).toEqual([]);
    expect(mockLatestCombinerProps.initialExternalAudio).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close workspace" }));
    expect(screen.getByText("camera.mp4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Remove Camera 1/ }));
    expect(screen.getByRole("button", { name: /Start Auto Edit/ })).toBeDisabled();
  });

  it("uses the editor's three-camera limit and supports replacing and removing selections", () => {
    render(<CamCombinerPanel />);
    const camera = new File(["camera"], "camera.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Camera 1 recording"), { target: { files: [camera] } });
    fireEvent.change(screen.getByLabelText("Camera 2 recording"), { target: { files: [camera] } });
    fireEvent.change(screen.getByLabelText("Add another camera recording"), {
      target: { files: [camera] },
    });
    expect(screen.queryByLabelText("Add another camera recording")).not.toBeInTheDocument();
    expect(screen.getByText("3/3 recordings selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove Camera 3" }));
    expect(screen.getByText("2/3 recordings selected")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Camera 3 recording"), { target: { files: [camera] } });
    fireEvent.click(screen.getByRole("button", { name: /Start Auto Edit/ }));
    expect(mockLatestCombinerProps.initialFiles).toHaveLength(3);
  });
});
