const { dispatchPlatformPost } = require('../services/platformPoster');
const spotifyService = require('../services/spotifyService');
jest.mock('../services/spotifyService');

describe('PlatformPoster Spotify handler', () => {
  it('adds tracks to playlist when playlistId and trackUris provided', async () => {
    spotifyService.addTracksToPlaylist.mockResolvedValue({ success: true, snapshotId: 'snap1', tracksAdded: 1 });
    const res = await dispatchPlatformPost({ platform: 'spotify', contentId: 'c1', payload: { playlistId: 'pl1', trackUris: ['spotify:track:t1'] }, reason: 'manual', uid: 'user1' });
    expect(res).toBeDefined();
    expect(res.success).toBe(true);
    expect(res.platform).toBe('spotify');
  });
  it('creates a playlist when name provided and adds tracks', async () => {
    spotifyService.postToSpotify.mockResolvedValue({ success: true, playlistId: 'pl2', name: 'p2', url: 'https://open.spotify.com/playlist/pl2' });
    const res = await dispatchPlatformPost({ platform: 'spotify', contentId: 'c1', payload: { name: 'My Playlist', trackUris: ['spotify:track:t1'] }, reason: 'manual', uid: 'user1' });
    expect(res).toBeDefined();
    expect(res.success).toBe(true);
    expect(res.platform).toBe('spotify');
  });
});
