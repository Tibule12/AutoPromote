const crypto = require("crypto");
const {
  assertOwnedStudioSourceBinding,
  getOwnedStudioSourceBinding,
} = require("../src/services/studioDirectorProjectBinding");

const hash = value => crypto.createHash("sha256").update(value).digest("hex");

const fakeFirestore = () => {
  const records = new Map();
  const writes = [];
  const firestore = {
    collection: name => {
      expect(name).toBe("users");
      return {
        doc: uid => ({
          collection: collectionName => {
            expect(collectionName).toBe("studioDirectorProjectBindings");
            return {
              doc: id => {
                const path = `users/${uid}/${collectionName}/${id}`;
                return {
                  create: async record => {
                    writes.push(path);
                    if (records.has(path))
                      throw Object.assign(new Error("already exists"), { code: 6 });
                    records.set(path, structuredClone(record));
                  },
                  get: async () => ({
                    exists: records.has(path),
                    data: () => structuredClone(records.get(path)),
                  }),
                };
              },
            };
          },
        }),
      };
    },
  };
  return { firestore, records, writes };
};

const input = {
  uid: "reviewer-1",
  projectId: "viral-project-1",
  sourceAssetId: "source:clip-1",
  sourceSha256: "a".repeat(64),
};

test("atomically binds the authenticated user, project and asset to observed bytes", async () => {
  const { firestore, records } = fakeFirestore();
  const created = await assertOwnedStudioSourceBinding({ ...input, firestore });
  const expectedId = hash(`${input.projectId}\0${input.sourceAssetId}`);
  expect(created).toMatchObject({
    schemaVersion: 1,
    bindingId: expectedId,
    ownerUid: input.uid,
    projectId: input.projectId,
    sourceAssetId: input.sourceAssetId,
    sourceSha256: input.sourceSha256,
  });
  expect(Date.parse(created.createdAt)).not.toBeNaN();
  expect([...records.keys()]).toEqual([
    `users/${input.uid}/studioDirectorProjectBindings/${expectedId}`,
  ]);
  expect(await getOwnedStudioSourceBinding({ ...input, firestore })).toEqual(created);
});

test("exact replay preserves the immutable record; changed bytes cannot replace it", async () => {
  const { firestore, records } = fakeFirestore();
  const created = await assertOwnedStudioSourceBinding({ ...input, firestore });
  const replay = await assertOwnedStudioSourceBinding({ ...input, firestore });
  expect(replay).toEqual(created);
  await expect(assertOwnedStudioSourceBinding({
    ...input, sourceSha256: "b".repeat(64), firestore,
  })).rejects.toMatchObject({ code: "PROJECT_SOURCE_CONFLICT", statusCode: 409 });
  expect(records.size).toBe(1);
  expect([...records.values()][0]).toEqual(created);
});

test("another asset, project or user has its own immutable binding", async () => {
  const { firestore, records } = fakeFirestore();
  await assertOwnedStudioSourceBinding({ ...input, firestore });
  await assertOwnedStudioSourceBinding({
    ...input, sourceAssetId: "source:clip-2", sourceSha256: "b".repeat(64), firestore,
  });
  await assertOwnedStudioSourceBinding({ ...input, projectId: "viral-project-2", firestore });
  await assertOwnedStudioSourceBinding({ ...input, uid: "reviewer-2", firestore });
  expect(records.size).toBe(4);
  expect(await getOwnedStudioSourceBinding({
    ...input, sourceAssetId: "source:missing", firestore,
  })).toBeNull();
  expect(await getOwnedStudioSourceBinding({
    ...input, uid: "reviewer-3", firestore,
  })).toBeNull();
});

test("rejects malformed identity and hash before touching storage", async () => {
  const { firestore, records, writes } = fakeFirestore();
  for (const changed of [
    { uid: "../other" },
    { projectId: "" },
    { sourceAssetId: "source:\nclip" },
    { sourceSha256: "unverified" },
    { sourceSha256: "A".repeat(64) },
  ]) {
    await expect(assertOwnedStudioSourceBinding({
      ...input, ...changed, firestore,
    })).rejects.toMatchObject({ code: "PROJECT_SOURCE_BINDING_INVALID", statusCode: 400 });
  }
  expect(records.size).toBe(0);
  expect(writes).toHaveLength(0);
});

test("fails closed on a malformed stored binding and storage outage", async () => {
  const { firestore, records } = fakeFirestore();
  const created = await assertOwnedStudioSourceBinding({ ...input, firestore });
  const path = [...records.keys()][0];
  records.set(path, { ...created, ownerUid: "another-user" });
  await expect(getOwnedStudioSourceBinding({ ...input, firestore })).rejects.toMatchObject({
    code: "PROJECT_SOURCE_STORE_UNAVAILABLE", statusCode: 503,
  });
  await expect(assertOwnedStudioSourceBinding({ ...input, firestore })).rejects.toMatchObject({
    code: "PROJECT_SOURCE_STORE_UNAVAILABLE", statusCode: 503,
  });
  const offline = {
    collection: () => ({ doc: () => ({ collection: () => ({
      doc: () => ({
        create: async () => { throw new Error("offline"); },
        get: async () => { throw new Error("offline"); },
      }),
    }) }) }),
  };
  await expect(assertOwnedStudioSourceBinding({ ...input, firestore: offline }))
    .rejects.toMatchObject({ code: "PROJECT_SOURCE_STORE_UNAVAILABLE", statusCode: 503 });
  await expect(getOwnedStudioSourceBinding({ ...input, firestore: offline }))
    .rejects.toMatchObject({ code: "PROJECT_SOURCE_STORE_UNAVAILABLE", statusCode: 503 });
});
