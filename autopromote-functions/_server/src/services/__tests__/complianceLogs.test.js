const { logComplianceEvent } = require("../complianceLogs");

jest.mock("../../firebaseAdmin", () => {
  const setMock = jest.fn(() => Promise.resolve());
  const docMock = jest.fn(() => ({ id: "doc-test-id", set: setMock }));
  const collectionMock = jest.fn(() => ({ doc: docMock }));
  const admin = { firestore: { FieldValue: { serverTimestamp: () => "now" } } };
  return { db: { collection: collectionMock }, admin };
});

describe("complianceLogs", () => {
  it("writes a minimal entry and returns id", async () => {
    const r = await logComplianceEvent({ type: "purchase", action: "created", userId: "u1", payload: { amount: 100 } });
    expect(r).toHaveProperty("id", "doc-test-id");
    expect(r).toMatchObject({ type: "purchase", action: "created", userId: "u1" });
  });

  it("throws when required fields missing", async () => {
    await expect(logComplianceEvent({})).rejects.toThrow(/type and action required/);
  });
});
