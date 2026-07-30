import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import ViralClipStudioPanel from "../ViralClipStudioPanel";

const mockVideoEditor = jest.fn();

jest.mock("../../hooks/useSubscription", () => ({
  useSubscription: () => ({ canUseFeature: () => true }),
}));

jest.mock("../../components/VideoEditor", () => props => {
  mockVideoEditor(props);
  return <div>Real Viral Clip Studio controller</div>;
});

describe("ViralClipStudioPanel", () => {
  beforeEach(() => mockVideoEditor.mockClear());

  test("opens the original Studio controller with the selected detected moment", () => {
    const source = new File(["video"], "source.mp4", { type: "video/mp4" });
    const clip = { id: "clip-1", start: 4, end: 24, score: 91 };
    render(
      <ViralClipStudioPanel initialFile={source} initialClip={clip} onOpenPublisher={() => {}} />
    );

    fireEvent.click(screen.getByRole("button", { name: /^open clip studio$/i }));

    expect(screen.getByText("Real Viral Clip Studio controller")).toBeInTheDocument();
    const studioFile = mockVideoEditor.mock.calls.at(-1)[0].file;
    expect(studioFile.openStudio).toBe(true);
    expect(studioFile.clips).toEqual([
      expect.objectContaining({ id: "clip-1", start: 4, end: 24, viralScore: 91 }),
    ]);
  });
});
