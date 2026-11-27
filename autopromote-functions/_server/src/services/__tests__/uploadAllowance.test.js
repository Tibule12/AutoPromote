const { effectiveUploadLimit, setUploadAllowance } = require("../uploadAllowance");

test("an allowance only increases capacity and rejects malformed persisted values", () => {
  expect(effectiveUploadLimit(20, { uploadAllowance: { monthlyLimit: 150 } })).toBe(150);
  for (const value of [0, -1, 12.5, "150", 10001, NaN])
    expect(effectiveUploadLimit(20, { uploadAllowance: { monthlyLimit: value } })).toBe(20);
  expect(effectiveUploadLimit(240, { uploadAllowance: { monthlyLimit: 150 } })).toBe(240);
});

test("invalid operator inputs cause no database operation", async () => {
  const db = { collection: jest.fn(), runTransaction: jest.fn() };
  await expect(
    setUploadAllowance(db, { monthlyLimit: 0, reason: "daily production" })
  ).rejects.toMatchObject({ status: 400 });
  await expect(setUploadAllowance(db, { monthlyLimit: 150, reason: "" })).rejects.toMatchObject({
    status: 400,
  });
  expect(db.collection).not.toHaveBeenCalled();
});

test("allowance and prior value are audited atomically, without replacing billing or usage", async () => {
  const writes = [];
  const db = {
    collection: name => ({ doc: id => ({ name, id }) }),
    runTransaction: run =>
      run({
        get: ref =>
          Promise.resolve({
            exists: true,
            data: () =>
              ref.name === "user_billing"
                ? { tier: "premium", uploads_this_month: 20, uploadAllowance: { monthlyLimit: 50 } }
                : {},
          }),
        set: (...args) => writes.push(args),
      }),
  };
  const value = await setUploadAllowance(db, {
    userId: "owner",
    adminId: "operator",
    monthlyLimit: 150,
    reason: "Four daily studio releases",
  });
  expect(writes).toHaveLength(2);
  expect(writes[0]).toEqual([
    { name: "user_billing", id: "owner" },
    { uploadAllowance: value },
    { merge: true },
  ]);
  expect(writes[1][1]).toMatchObject({
    action: "set_upload_allowance",
    adminId: "operator",
    previous: { monthlyLimit: 50 },
  });
});

test("a nonexistent account receives no allowance or audit write", async () => {
  const set = jest.fn();
  const db = {
    collection: name => ({ doc: () => ({ name }) }),
    runTransaction: run =>
      run({ get: async () => ({ exists: false, data: () => undefined }), set }),
  };
  await expect(
    setUploadAllowance(db, {
      userId: "missing",
      adminId: "operator",
      monthlyLimit: 150,
      reason: "Four daily releases",
    })
  ).rejects.toMatchObject({ status: 404 });
  expect(set).not.toHaveBeenCalled();
});
