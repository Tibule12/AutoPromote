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

  // Initially upload tab should be active (tab button should be selected)
  const uploadTab = screen.getByRole("tab", { name: /Upload Content/i });
  expect(uploadTab).toBeInTheDocument();
  expect(uploadTab).toHaveAttribute("aria-selected", "true");

  // Click history tab
  const historyBtn = screen.getByRole("tab", { name: /Upload History/i });
  fireEvent.click(historyBtn);

  // Now the history tab should be selected and the cute video card should appear
  const historyTab = screen.getByRole("tab", { name: /Upload History/i });
  expect(historyTab).toBeInTheDocument();
  expect(historyTab).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText(/Cute Video/i)).toBeInTheDocument();
  expect(screen.getByText(/Lovely short clip/i)).toBeInTheDocument();
  expect(screen.getByText(/Tiktok/i)).toBeInTheDocument();
  // Ensure the created date badge is visible (date string) scoped to the card
  const { within } = require("@testing-library/react");
  const cards = screen.getAllByRole("button");
  const card = cards.find(c => within(c).queryByText(/Cute Video/i));
  expect(card).toBeDefined();
  // Match either YYYY/MM/DD or MM/DD/YYYY formats (CI runners vary by locale)
  expect(
    within(card).getByText(/(?:\d{4}\/\d{1,2}\/\d{1,2})|(?:\d{1,2}\/\d{1,2}\/\d{4})/)
  ).toBeInTheDocument();
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

  // The processing label should be visible inside the content card and the 'View on platform' link should be present
  const { within } = require("@testing-library/react");
  const cards = screen.getAllByRole("button");
  const card = cards.find(c => within(c).queryByText(/Processing Video/i));
  expect(card).toBeDefined();
  expect(within(card).getByText(/Still processing/i)).toBeInTheDocument();
  expect(within(card).getByRole("link", { name: /View on platform/i })).toBeInTheDocument();
});
