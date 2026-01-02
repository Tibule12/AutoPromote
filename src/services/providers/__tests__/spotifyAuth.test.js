const axios = require("axios");
jest.mock("axios");

const { getAccessToken } = require("../spotifyAuth");

describe("spotifyAuth", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test("getAccessToken requests token and caches it", async () => {
    axios.post.mockResolvedValue({ data: { access_token: "abc123", expires_in: 3600 } });
    const token1 = await getAccessToken("id1", "secret1");
    expect(token1).toBe("abc123");
    // subsequent call should not call axios.post again (cached)
    axios.post.mockImplementation(() => {
      throw new Error("should not call");
    });
    const token2 = await getAccessToken("id1", "secret1");
    expect(token2).toBe("abc123");
  });

  test("returns null if no credentials", async () => {
    const t = await getAccessToken(null, null);
    expect(t).toBeNull();
  });
});
