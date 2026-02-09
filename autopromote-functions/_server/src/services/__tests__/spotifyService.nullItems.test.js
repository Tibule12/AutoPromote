jest.setTimeout(10000);

jest.mock("../../utils/ssrfGuard", () => ({
  safeFetch: jest.fn(),
}));

const ssrf = require("../../utils/ssrfGuard");
const spotifyService = require("../spotifyService");

describe("spotifyService searchTracks handles null items from Spotify API", () => {
  it("filters out null items and returns valid results", async () => {
    // Mock access token resolution
    jest.spyOn(spotifyService, "getValidAccessToken").mockResolvedValue("dummy-token");

    // Mock safeFetch to return arrays with null items
    ssrf.safeFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        tracks: {
          items: [
            null,
            {
              id: "t1",
              uri: "spotify:track:t1",
              name: "Track One",
              artists: [{ name: "Artist One" }],
              album: { name: "Album One", images: [{ url: "img1" }] },
              external_urls: { spotify: "https://open.spotify.com/track/t1" },
              preview_url: "https://p.mp3",
              popularity: 50,
            },
          ],
        },
        albums: { items: [null] },
        playlists: { items: [null] },
        shows: { items: [null] },
        episodes: { items: [null] },
      }),
    });

    const res = await spotifyService.searchTracks({ uid: "user1", query: "test" });

    expect(res).toBeDefined();
    expect(Array.isArray(res.results)).toBe(true);
    // There should be at least one valid track
    expect(res.results.some(r => r && r.type === "track" && r.id === "t1")).toBe(true);
    // Ensure no null entries were included
    expect(res.results.every(Boolean)).toBe(true);
  });
});
