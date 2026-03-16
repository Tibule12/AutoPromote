import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UploadPanel from "../UserDashboardTabs/UploadPanel";

jest.mock("../features/publishing/UnifiedPublisher", () => () => <div>Unified Publisher Mock</div>);
jest.mock("../firebaseClient", () => ({
  auth: { currentUser: null },
}));

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

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ content: contentList }),
  });

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
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(screen.getByText(/Cute Video/i)).toBeInTheDocument();
  expect(screen.getByText(/Lovely short clip/i)).toBeInTheDocument();
  expect(screen.getByText(/Tiktok/i)).toBeInTheDocument();
  // Ensure the created date badge is visible (date string) scoped to the card
  const card = screen.getByText(/Cute Video/i).closest("article");
  expect(card).toBeTruthy();
  // Match either YYYY/MM/DD or MM/DD/YYYY formats (CI runners vary by locale)
  expect(
    require("@testing-library/react")
      .within(card)
      .getByText(/(?:\d{4}\/\d{1,2}\/\d{1,2})|(?:\d{1,2}\/\d{1,2}\/\d{4})/)
  ).toBeInTheDocument();
});

test("upload history shows View on platform link and refresh when processing", async () => {
  const onUpload = jest.fn();
  const contentList = [
    {
      id: "content-123",
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

  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            ...contentList[0],
            status: "processing",
            target_platforms: ["tiktok"],
          },
        ],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            ...contentList[0],
            status: "published",
            target_platforms: ["tiktok"],
          },
        ],
      }),
    });

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

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/content/my-content",
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/json" }),
        credentials: "include",
      })
    );
  });

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /Refresh status/i })).toBeInTheDocument()
  );
  expect(screen.getByText(/Still processing/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /View on platform/i })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Download media/i })).toHaveAttribute(
    "href",
    "/api/content/content-123/download"
  );

  fireEvent.click(screen.getByRole("button", { name: /Refresh status/i }));
  await waitFor(() => expect(screen.getByText(/published/i)).toBeInTheDocument());
});

afterEach(() => {
  jest.restoreAllMocks();
  delete global.fetch;
});
