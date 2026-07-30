import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import FindViralClipsPanel from "../FindViralClipsPanel";

jest.mock("../../components/ViralScanner", () => props => (
  <button
    type="button"
    onClick={() =>
      props.onSelectClip({
        id: "clip-1",
        start: 4,
        end: 24,
        score: 91,
        reason: "Strong opening reaction",
      })
    }
  >
    Select detected moment
  </button>
));

describe("FindViralClipsPanel Viral Clip Studio handoff", () => {
  test("hands the scanned clip to the separate Viral Clip Studio route", () => {
    const source = new File(["video"], "source.mp4", { type: "video/mp4" });
    const onOpenStudio = jest.fn();
    render(<FindViralClipsPanel initialFile={source} onOpenStudio={onOpenStudio} />);

    fireEvent.click(screen.getByRole("button", { name: /analyse video/i }));
    fireEvent.click(screen.getByRole("button", { name: /select detected moment/i }));
    fireEvent.click(screen.getByRole("button", { name: /open in viral clip studio/i }));

    expect(onOpenStudio).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ id: "clip-1", start: 4, end: 24, score: 91 })
    );
  });
});
