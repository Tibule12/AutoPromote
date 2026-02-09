const { formatSearchResults } = require("../spotifyService");

describe("formatSearchResults", () => {
  it("filters out null items and normalizes entries", () => {
    const data = {
      tracks: {
        items: [
          null,
          {
            id: "t1",
            uri: "spotify:track:t1",
            name: "T1",
            artists: [{ name: "A1" }],
            album: { name: "AL1", images: [{ url: "img" }] },
            external_urls: { spotify: "url" },
            preview_url: null,
            popularity: 10,
          },
        ],
      },
      albums: { items: [null] },
      playlists: { items: [null] },
      shows: { items: [null] },
      episodes: { items: [null] },
    };

    const res = formatSearchResults(data);
    expect(res).toBeDefined();
    expect(Array.isArray(res.results)).toBe(true);
    expect(res.results.length).toBe(1);
    expect(res.results[0]).toMatchObject({ type: "track", id: "t1", name: "T1", artists: ["A1"] });
  });
});
