import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ConnectionsPanel from "../UserDashboardTabs/ConnectionsPanel";
import { mapTikTokStatusResponse } from "../hooks/usePlatformStatus";

describe("ConnectionsPanel display and disconnect", () => {
  test("hides all four withdrawn connections even when connected, including diagnostics", () => {
    render(<ConnectionsPanel platformSummary={{summary:{twitter:{username:'hidden-handle'},snapchat:{connected:true},spotify:{connected:true},pinterest:{connected:true}}}}
      twitterStatus={{connected:true,identity:{username:'hidden-handle'},oauth1_missing:true}}
      snapchatStatus={{connected:true}} spotifyStatus={{connected:true}} pinterestStatus={{connected:true}} />);
    for(const name of ['Twitter','Snapchat','Spotify','Pinterest','hidden-handle'])expect(screen.queryByText(new RegExp(name,'i'))).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:/Connect (Twitter|Snapchat|Spotify|Pinterest)/i})).not.toBeInTheDocument();
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

  test("shows Meta requirements when Facebook auth exists without a publishable Meta setup", () => {
    render(
      <ConnectionsPanel
        platformSummary={{ summary: {} }}
        twitterStatus={{ connected: false }}
        tiktokStatus={{ connected: false }}
        youtubeStatus={{ connected: false }}
        spotifyStatus={{ connected: false }}
        redditStatus={{ connected: false }}
        discordStatus={{ connected: false }}
        facebookStatus={{ connected: true, pages: [] }}
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

    expect(
      screen.getAllByText(
        /Meta requires a Facebook Page and an Instagram business account linked to that Page/i
      ).length
    ).toBeGreaterThan(0);
  });

  test("hides Meta requirements once a page and linked Instagram business account are connected", () => {
    render(
      <ConnectionsPanel
        platformSummary={{ summary: {} }}
        twitterStatus={{ connected: false }}
        tiktokStatus={{ connected: false }}
        youtubeStatus={{ connected: false }}
        spotifyStatus={{ connected: false }}
        redditStatus={{ connected: false }}
        discordStatus={{ connected: false }}
        facebookStatus={{
          connected: true,
          pages: [
            {
              id: "page-1",
              name: "Main Page",
              instagram_business_account: { id: "ig-1", username: "brand.ig" },
            },
          ],
        }}
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

    expect(
      screen.queryByText(
        /Meta requires a Facebook Page and an Instagram business account linked to that Page/i
      )
    ).not.toBeInTheDocument();
  });
});

export {};
