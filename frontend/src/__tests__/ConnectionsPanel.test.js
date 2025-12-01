import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConnectionsPanel from '../UserDashboardTabs/ConnectionsPanel';

describe('ConnectionsPanel display and disconnect', () => {
  test('shows username for connected Twitter and calls disconnect handler', () => {
    const handleDisconnect = jest.fn();
    const platformSummary = { summary: { twitter: { username: 'bob' } } };
    render(<ConnectionsPanel platformSummary={platformSummary}
      twitterStatus={{ connected: true, identity: { username: 'bob' } }}
      tiktokStatus={{ connected: false }} youtubeStatus={{ connected: false }} spotifyStatus={{ connected: false }} redditStatus={{ connected: false }} discordStatus={{ connected: false }} facebookStatus={{ connected: false }} linkedinStatus={{ connected: false }} snapchatStatus={{ connected: false }} telegramStatus={{ connected: false }} pinterestStatus={{ connected: false }}
      handleConnectTwitter={()=>{}} handleConnectTikTok={()=>{}} handleConnectYouTube={()=>{}} handleConnectSpotify={()=>{}} handleConnectReddit={()=>{}} handleConnectDiscord={()=>{}} handleConnectFacebook={()=>{}} handleConnectLinkedin={()=>{}} handleConnectSnapchat={()=>{}} handleConnectTelegram={()=>{}} handleConnectPinterest={()=>{}} handleDisconnectPlatform={handleDisconnect}
    />);
    expect(screen.getByText(/Twitter connected.*bob/)).toBeInTheDocument();
    const disconnectBtn = screen.getByLabelText(/Disconnect Twitter/i);
    fireEvent.click(disconnectBtn);
    expect(handleDisconnect).toHaveBeenCalledWith('twitter');
  });
});

export {};
