import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import FindViralClipsPanel from "../FindViralClipsPanel";

let mockScannerProps;
jest.mock("../../components/ViralScanner", () => props => {
  mockScannerProps=props;
  return (
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
);});

describe("FindViralClipsPanel Viral Clip Studio handoff", () => {
  test('length, destinations and editorial brief reach the analyser; no thumbnail tools remain',()=>{
    render(<FindViralClipsPanel initialFile={new File(['video'],'source.mp4',{type:'video/mp4'})} />);
    fireEvent.change(screen.getByLabelText('Target length'),{target:{value:'60–90 seconds'}});
    fireEvent.click(screen.getByRole('button',{name:/TikTok/}));
    fireEvent.change(screen.getByLabelText(/What should we look for/),{target:{value:'customer retention'}});
    fireEvent.click(screen.getByRole('button',{name:/Analyse video/}));
    expect(mockScannerProps.selectionSettings).toEqual({version:'moments-v2',minDuration:60,maxDuration:90,destinations:['instagram_reels','youtube_shorts'],focus:'customer retention'});
    expect(screen.queryByText(/thumbnail|poster/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Target length')).toBeDisabled();
  });
  test('zero results finish the scan with a useful state and allow another analysis',()=>{
    render(<FindViralClipsPanel initialFile={new File(['video'],'source.mp4',{type:'video/mp4'})} />);
    fireEvent.click(screen.getByRole('button',{name:/Analyse video/}));
    const {act}=require('@testing-library/react');act(()=>mockScannerProps.onResults([]));
    expect(screen.getByRole('status')).toHaveTextContent('No moments matched');
    expect(screen.getByRole('button',{name:/Analyse video/})).toBeEnabled();
    fireEvent.change(document.querySelector('.viral-file-picker input'), {target:{files:[new File(['next'],'next.mp4',{type:'video/mp4'})]}});
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  test('preview stops at the selected moment end and changing settings clears old suggestions',()=>{
    const pause=jest.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{}),play=jest.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined);
    render(<FindViralClipsPanel initialFile={new File(['video'],'source.mp4',{type:'video/mp4'})} />);
    fireEvent.click(screen.getByRole('button',{name:/Analyse video/}));fireEvent.click(screen.getByRole('button',{name:/Finish scan/}));
    fireEvent.click(screen.getByRole('button',{name:/Preview/}));
    const video=document.querySelector('video');expect(video.currentTime).toBe(4);video.currentTime=24;fireEvent.timeUpdate(video);expect(pause).toHaveBeenCalled();
    expect(screen.queryByText('High confidence')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Target length'),{target:{value:'15–30 seconds'}});
    expect(screen.queryByRole('button',{name:/Create clip/})).not.toBeInTheDocument();pause.mockRestore();play.mockRestore();
  });
  test("hands the scanned clip to the separate Viral Clip Studio route", () => {
    const source = new File(["video"], "source.mp4", { type: "video/mp4" });
    const onOpenStudio = jest.fn();
    render(<FindViralClipsPanel initialFile={source} onOpenStudio={onOpenStudio} />);

    expect(screen.queryByLabelText(/Caption language/i)).not.toBeInTheDocument();
    expect(screen.getByText(/code-switching stay original by default/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /analyse video/i }));
    fireEvent.click(screen.getByRole("button", { name: /finish scan/i }));
    fireEvent.click(screen.getByRole("button", { name: /create clip/i }));

    expect(onOpenStudio).toHaveBeenCalledWith(
      source,
      expect.objectContaining({
        id: "clip-1",
        start: 4,
        end: 24,
        score: 91,
        autoTrackOnOpen: true,
        targetAspectRatio: "9:16",
      }),
      [expect.objectContaining({ id: "clip-1", start: 4, end: 24, autoTrackOnOpen: true, targetAspectRatio: "9:16" })]
    );
  });

  test("sorts suggested moments by Reels, Shorts, or TikTok format and sends target format into Studio", () => {
    const source = new File(["video"], "source.mp4", { type: "video/mp4" });
    const onOpenStudio = jest.fn();
    render(<FindViralClipsPanel initialFile={source} onOpenStudio={onOpenStudio} />);

    fireEvent.click(screen.getByRole("button", { name: /analyse video/i }));
    const { act } = require("@testing-library/react");
    act(() =>
      mockScannerProps.onResults([
        {
          id: "long-reel",
          start: 0,
          end: 72,
          duration: 72,
          score: 92,
          hookText: "Long story beat",
          targetAspectRatio: "9:16",
          recommendedDestination: "instagram_reels",
          destinationScores: { instagram_reels: 91, tiktok: 85, youtube_shorts: 70 },
          formatTags: [
            { id: "instagram_reels", label: "Instagram Reels", aspect: "9:16", score: 91, fit: "Strong fit" },
            { id: "tiktok", label: "TikTok", aspect: "9:16", score: 85, fit: "Strong fit" },
            { id: "youtube_shorts", label: "YouTube Shorts", aspect: "9:16", score: 70, fit: "Trim needed", note: "Trim to 60s or under for YouTube Shorts" },
          ],
        },
        {
          id: "punchy-short",
          start: 80,
          end: 112,
          duration: 32,
          score: 88,
          hookText: "Why this works fast",
          targetAspectRatio: "9:16",
          recommendedDestination: "youtube_shorts",
          destinationScores: { youtube_shorts: 94, tiktok: 89, instagram_reels: 84 },
          formatTags: [
            { id: "youtube_shorts", label: "YouTube Shorts", aspect: "9:16", score: 94, fit: "Strong fit" },
            { id: "tiktok", label: "TikTok", aspect: "9:16", score: 89, fit: "Strong fit" },
            { id: "instagram_reels", label: "Instagram Reels", aspect: "9:16", score: 84, fit: "Strong fit" },
          ],
        },
      ])
    );

    const sortBar = screen.getByTestId("viral-format-sort-bar");
    expect(sortBar).toHaveTextContent("9:16 Vertical");

    // Default "All selected": long-reel (92) ranks first.
    let titles = Array.from(document.querySelectorAll(".viral-moment-copy strong")).map(el => el.textContent);
    expect(titles[0]).toBe("Long story beat");

    // Switching sort to YouTube Shorts moves the <=60s punchy-short first.
    fireEvent.click(within(sortBar).getByRole("button", { name: "YouTube Shorts" }));
    titles = Array.from(document.querySelectorAll(".viral-moment-copy strong")).map(el => el.textContent);
    expect(titles[0]).toBe("Why this works fast");

    const createButtons = screen.getAllByRole("button", { name: /create clip/i });
    fireEvent.click(createButtons[0]);
    expect(onOpenStudio).toHaveBeenCalledWith(
      source,
      expect.objectContaining({
        id: "punchy-short",
        autoTrackOnOpen: true,
        targetAspectRatio: "9:16",
        preferredDestination: "youtube_shorts",
      }),
      expect.any(Array)
    );
  });
});
