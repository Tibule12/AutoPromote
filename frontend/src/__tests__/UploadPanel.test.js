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
      description: "Lovely short clip",
      platforms: ["tiktok"],
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
  expect(screen.getByText(/Lovely short clip/i)).toBeInTheDocument();
  expect(screen.getByText(/Tiktok/i)).toBeInTheDocument();
  // Ensure the created date badge is visible (date string)
  expect(screen.getByText(/\d{1,2}\/\d{1,2}\/\d{4}/i)).toBeInTheDocument();
});

test("upload history shows View on platform link and refresh when processing", async () => {
  const onUpload = jest.fn();
  const contentList = [
    {
      title: "Processing Video",
      type: "video",
      url: "/video.mp4",
      createdAt: Date.now(),
      status: "processing",
      description: "Still processing",
      platforms: ["tiktok"],
      platform_post_url: "https://www.tiktok.com/@user/video/123",
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

  const historyBtn = screen.getByRole("tab", { name: /Upload History/i });
  fireEvent.click(historyBtn);

  // The processing label should be visible
  expect(screen.getByText(/processing/i)).toBeInTheDocument();

  // The 'View on platform' link should be present
  expect(screen.getByText(/View on platform/i)).toBeInTheDocument();
});
