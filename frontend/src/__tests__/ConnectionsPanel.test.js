import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ConnectionsPanel from "../UserDashboardTabs/ConnectionsPanel";
import { mapTikTokStatusResponse } from "../hooks/usePlatformStatus";

describe("ConnectionsPanel display and disconnect", () => {
  test("shows username for connected Twitter and calls disconnect handler", () => {
    const handleDisconnect = jest.fn();
    const platformSummary = { summary: { twitter: { username: "bob" } } };
    render(
      <ConnectionsPanel
        platformSummary={platformSummary}
        twitterStatus={{ connected: true, identity: { username: "bob" } }}
        tiktokStatus={{ connected: false }}
        youtubeStatus={{ connected: false }}
        spotifyStatus={{ connected: false }}
        redditStatus={{ connected: false }}
        discordStatus={{ connected: false }}
        facebookStatus={{ connected: false }}
        linkedinStatus={{ connected: false }}
        snapchatStatus={{ connected: false }}
        telegramStatus={{ connected: false }}
        pinterestStatus={{ connected: false }}
        handleConnectTwitter={() => {}}
        handleConnectTikTok={() => {}}
        handleConnectYouTube={() => {}}
        handleConnectSpotify={() => {}}
        handleConnectReddit={() => {}}
        handleConnectDiscord={() => {}}
        handleConnectFacebook={() => {}}
        handleConnectLinkedin={() => {}}
        handleConnectSnapchat={() => {}}
        handleConnectTelegram={() => {}}
        handleConnectPinterest={() => {}}
        handleDisconnectPlatform={handleDisconnect}
      />
    );
    // The UI shows the twitter handle as @bob, check for that
    expect(screen.getByText(/@bob/)).toBeInTheDocument();
    const disconnectBtn = screen.getByLabelText(/Disconnect Twitter/i);
    fireEvent.click(disconnectBtn);
    expect(handleDisconnect).toHaveBeenCalledWith("twitter");
  });

  test("shows upload-ready note for aggregate TikTok payload with publish scopes", () => {
    const tiktokStatus = mapTikTokStatusResponse({
      connected: true,
      provider: "tiktok",
      hasEncryption: true,
      open_id: "openid-1",
      scope: "user.info.profile,video.list,video.publish,video.upload",
      display_name: "Joyce@",
    });

    render(
      <ConnectionsPanel
        platformSummary={{ summary: { tiktok: { connected: true, display_name: "Joyce@" } } }}
        twitterStatus={{ connected: false }}
        tiktokStatus={tiktokStatus}
        youtubeStatus={{ connected: false }}
        spotifyStatus={{ connected: false }}
        redditStatus={{ connected: false }}
        discordStatus={{ connected: false }}
        facebookStatus={{ connected: false }}
        linkedinStatus={{ connected: false }}
        snapchatStatus={{ connected: false }}
        telegramStatus={{ connected: false }}
        pinterestStatus={{ connected: false }}
        handleConnectTwitter={() => {}}
        handleConnectTikTok={() => {}}
        handleConnectYouTube={() => {}}
        handleConnectSpotify={() => {}}
        handleConnectReddit={() => {}}
        handleConnectDiscord={() => {}}
        handleConnectFacebook={() => {}}
        handleConnectLinkedin={() => {}}
        handleConnectSnapchat={() => {}}
        handleConnectTelegram={() => {}}
        handleConnectPinterest={() => {}}
      />
    );

    expect(screen.getByText("Upload-ready for TikTok publishing.")).toBeInTheDocument();
  });
});

export {};
