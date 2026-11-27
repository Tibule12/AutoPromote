describe("concurrent cached Firestore lookups", () => {
  let withCache;
  beforeEach(() => {
    jest.resetModules();
    ({ withCache } = require("../simpleCache"));
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it("shares one pending lookup and retains the existing cache lifetime", async () => {
    let finish;
    const read = jest.fn(
      () =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    const requests = [withCache("user-a", 30000, read), withCache("user-a", 30000, read)];
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    finish({ notifications: ["one"] });
    expect(await Promise.all(requests)).toEqual([
      { notifications: ["one"] },
      { notifications: ["one"] },
    ]);
    expect(await withCache("user-a", 30000, read)).toEqual({
      notifications: ["one"],
      _cached: true,
    });
    jest.advanceTimersByTime(30001);
    const nextRead = jest.fn().mockResolvedValue({ notifications: ["two"] });
    expect(await withCache("user-a", 30000, nextRead)).toEqual({ notifications: ["two"] });
    expect(nextRead).toHaveBeenCalledTimes(1);
  });

  it("keeps users and query limits separate", async () => {
    const readA = jest.fn().mockResolvedValue({ uid: "a" });
    const readB = jest.fn().mockResolvedValue({ uid: "b" });
    const readLarger = jest.fn().mockResolvedValue({ uid: "a", limit: 50 });
    expect(
      await Promise.all([
        withCache("notifications_a_10", 30000, readA),
        withCache("notifications_b_10", 30000, readB),
        withCache("notifications_a_50", 30000, readLarger),
      ])
    ).toEqual([{ uid: "a" }, { uid: "b" }, { uid: "a", limit: 50 }]);
  });

  it("releases failed lookups so later requests can retry", async () => {
    const read = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ready: true });
    const result = await Promise.allSettled([
      withCache("same-user", 1000, read),
      withCache("same-user", 1000, read),
    ]);
    expect(result.map(r => r.status)).toEqual(["rejected", "rejected"]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(await withCache("same-user", 1000, read)).toEqual({ ready: true });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
