import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import FindViralClipsPanel from "../FindViralClipsPanel";

jest.mock("../../components/ViralScanner", () => props => (
  <button
    type="button"
    onClick={() =>
      props.onResults([
        {
          id: "clip-1",
          start: 4,
          end: 24,
          score: 91,
          reason: "Strong opening reaction",
        },
      ])
    }
  >
    Finish scan
  </button>
));

describe("FindViralClipsPanel Viral Clip Studio handoff", () => {
  test("hands the scanned clip to the separate Viral Clip Studio route", () => {
    const source = new File(["video"], "source.mp4", { type: "video/mp4" });
    const onOpenStudio = jest.fn();
    render(<FindViralClipsPanel initialFile={source} onOpenStudio={onOpenStudio} />);

    fireEvent.click(screen.getByRole("button", { name: /analyse video/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish scan/i }));
    fireEvent.click(screen.getByRole("button", { name: /create clip/i }));

    expect(onOpenStudio).toHaveBeenCalledWith(
      source,
      expect.objectContaining({ id: "clip-1", start: 4, end: 24, score: 91 })
    );
  });
});
