const {
  shouldDeleteTemporaryObject,
  toMillis,
} = require("../storageRetentionPolicy");

describe("storage retention policy", () => {
  const now = Date.parse("2026-07-10T12:00:00.000Z");
  const oneDay = 24 * 60 * 60 * 1000;

  it("does not treat a Date.now filename prefix as an expiry", () => {
    const shouldDelete = shouldDeleteTemporaryObject({
      metadata: { timeCreated: "2026-07-10T11:59:00.000Z" },
      now,
      retentionMs: oneDay,
      fileName: "temp/multicam/user/1783690000000_camera.mov",
    });

    expect(shouldDelete).toBe(false);
  });

  it("deletes an object after the normal retention window", () => {
    expect(
      shouldDeleteTemporaryObject({
        metadata: { timeCreated: "2026-07-09T11:59:59.000Z" },
        now,
        retentionMs: oneDay,
      })
    ).toBe(true);
  });

  it("honors an explicit metadata expiry", () => {
    expect(
      shouldDeleteTemporaryObject({
        metadata: {
          timeCreated: "2026-07-10T11:59:00.000Z",
          metadata: { deleteAfter: "2026-07-10T11:59:30.000Z" },
        },
        now,
        retentionMs: oneDay,
      })
    ).toBe(true);
  });

  it("normalizes Firestore timestamps and ISO dates", () => {
    expect(toMillis({ toDate: () => new Date(now) })).toBe(now);
    expect(toMillis("2026-07-10T12:00:00.000Z")).toBe(now);
  });
});
