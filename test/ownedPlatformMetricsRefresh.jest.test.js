describe("account-owned platform statistics refresh", () => {
  let rows, writes, fetchStats, refresh;
  beforeEach(() => {
    jest.resetModules();
    rows = { own: { uid: "owner", success: true, platform: "youtube", externalId: "real-video" },
      other: { uid: "other", success: true, platform: "youtube", externalId: "other-video" } };
    writes = [];
    const refs = new Map();
    const ref = id => {
      if (!refs.has(id)) refs.set(id, { id,
        get: async () => ({ id, ref: ref(id), exists: !!rows[id], data: () => rows[id] }),
        set: async update => { writes.push({ id, update }); Object.assign(rows[id], update); },
      });
      return refs.get(id);
    };
    const db = { collection: () => ({ doc: ref }), runTransaction: async callback => callback({
      get: r => r.get(), set: (r, update) => { writes.push({ id: r.id, update }); Object.assign(rows[r.id], update); },
    }) };
    jest.doMock("../src/firebaseAdmin", () => ({ db }));
    fetchStats = jest.fn().mockResolvedValue({ view_count: 0, like_count: 2 });
    jest.doMock("../src/services/platformMetricsService", () => ({ fetchYouTubeMetrics: fetchStats }));
    refresh = require("../src/services/ownedPlatformMetricsRefresh").refreshOwnedPlatformMetrics;
  });

  test("rejects the complete mixed-owner batch before any provider call or write", async () => {
    await expect(refresh("owner", ["own", "other"])).rejects.toMatchObject({ status: 403 });
    expect(fetchStats).not.toHaveBeenCalled(); expect(writes).toEqual([]);
  });
  test("rejects simulated or failed post records", async () => {
    rows.own.simulated = true;
    await expect(refresh("owner", ["own"])).rejects.toMatchObject({ status: 403 });
    expect(fetchStats).not.toHaveBeenCalled(); expect(writes).toEqual([]);
  });
  test.each([[[]], [["own", "own"]], [["bad/id"]], [Array.from({ length: 7 }, (_, i) => `p${i}`)]])(
    "rejects invalid refresh selection %j", async selection => {
      await expect(refresh("owner", selection)).rejects.toMatchObject({ status: 400 });
      expect(fetchStats).not.toHaveBeenCalled(); expect(writes).toEqual([]);
    });
  test("retains genuine zero views and establishes a bounded future poll", async () => {
    const result = await refresh("owner", ["own"]);
    expect(result[0]).toMatchObject({ status: "collected", metrics: { views: 0, likes: 2, shares: null } });
    expect(fetchStats).toHaveBeenCalledWith("owner", "real-video");
    expect(rows.own.analytics_snapshots[0].views).toBe(0);
    expect(Date.parse(rows.own.next_check_at)).toBeGreaterThan(Date.now());
    expect(rows.own.lastMetricsSuccessAt).toBeTruthy();
  });
  test("a provider without data cannot replace prior measurements with zeros", async () => {
    rows.own.metrics = { view_count: 120 };
    fetchStats.mockResolvedValue(null);
    const result = await refresh("owner", ["own"]);
    expect(result[0]).toMatchObject({ status: "unavailable", metrics: null });
    expect(rows.own.metrics).toEqual({ view_count: 120 });
    expect(rows.own.analytics_snapshots).toBeUndefined();
  });
  test("repeated refresh respects the transactional cooldown", async () => {
    rows.own.lastMetricsRefreshRequestedAt = new Date().toISOString();
    expect((await refresh("owner", ["own"]))[0].status).toBe("cooldown");
    expect(fetchStats).not.toHaveBeenCalled(); expect(writes).toEqual([]);
  });
});
