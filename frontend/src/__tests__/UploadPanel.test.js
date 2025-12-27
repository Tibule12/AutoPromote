import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import UploadPanel from "../UserDashboardTabs/UploadPanel";

test("upload panel toggles between upload and history tabs", async () => {
  const onUpload = jest.fn();
  const contentList = [
    {
      title: "Cute Video",
      type: "video",
      url: "/video.mp4",
      createdAt: Date.now(),
      status: "published",
    },
  ];

  render(
    <UploadPanel
      onUpload={onUpload}
      contentList={contentList}
      platformMetadata={{}}
      platformOptions={{}}
      setPlatformOption={() => {}}
      selectedPlatforms={["tiktok"]}
      setSelectedPlatforms={() => {}}
      spotifySelectedTracks={[]}
      setSpotifySelectedTracks={() => {}}
    />
  );

  // Initially upload tab should be active
  expect(screen.getByText(/Upload Content/i)).toBeInTheDocument();

  // Click history tab
  const historyBtn = screen.getByRole("tab", { name: /Upload History/i });
  fireEvent.click(historyBtn);

  // Now the history heading and the cute video card should appear
  expect(screen.getByText(/Upload History/i)).toBeInTheDocument();
  expect(screen.getByText(/Cute Video/i)).toBeInTheDocument();
});
