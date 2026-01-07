const { createBoard } = require("../pinterestService");

jest.mock("../../firebaseAdmin", () => {
  const sets = {};
  return {
    db: {
      collection: () => ({
        doc: _uid => ({
          collection: () => ({
            doc: _platform => ({
              get: async () => ({ exists: true, data: () => ({}) }),
              set: async (val, opts) => {
                sets[_uid] = sets[_uid] || [];
                sets[_uid].push({ platform: _platform, val, opts });
                return true;
              },
            }),
          }),
          get: async () => ({ exists: false, data: () => ({}) }),
          set: async () => true,
        }),
      }),
      __sets: sets,
    },
  };
});

jest.mock("../../utils/ssrfGuard", () => ({
  safeFetch: jest.fn(async (url, fetchFn, opts) => ({
    ok: true,
    json: async () => ({
      id: "b123",
      name: opts && opts.fetchOptions && JSON.parse(opts.fetchOptions.body).name,
      description: JSON.parse(opts.fetchOptions.body).description,
    }),
  })),
}));

describe("pinterestService.createBoard", () => {
  test("simulates board create when no token present", async () => {
    const res = await createBoard({ name: "Test Board", description: "Desc", uid: "user_test" });
    expect(res.ok).toBe(true);
    expect(res.simulated).toBe(true);
    expect(res.board).toHaveProperty("id");
    expect(res.board.name).toBe("Test Board");
  });

  test("creates board with access token via Pinterest API", async () => {
    // Mock the Firestore connection to include a token
    const db = require("../../firebaseAdmin").db;
    // overwrite get to return a token
    db.collection = () => ({
      doc: _uid => ({
        collection: () => ({
          doc: _platform => ({
            get: async () => ({
              exists: true,
              data: () => ({ tokens: { access_token: "fake-token" }, meta: { boards: [] } }),
            }),
            set: async () => true,
          }),
        }),
      }),
    });
    const res = await createBoard({
      name: "API Board",
      description: "From API",
      uid: "user_test2",
    });
    expect(res.ok).toBe(true);
    expect(res.simulated).not.toBe(true);
    expect(res.board.id).toBe("b123");
    expect(res.board.name).toBe("API Board");
  });
});
