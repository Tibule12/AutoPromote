import { historyMediaIdentity, historySubjectVfxIdentity } from "../studioHistoryMedia";

test("refreshing owned playback access preserves the edit identity", () => {
  const clip = { id: "source", storagePath: "uploads/owner/source.mp4", startTime: 0, endTime: 12 };
  expect(historyMediaIdentity({ ...clip, url: "https://storage/source?signature=old" }))
    .toEqual(historyMediaIdentity({ ...clip, url: "https://storage/source?signature=new" }));
});

test.each([
  { storagePath: "uploads/owner/other.mp4" },
  { sourceContentHash: "different-content" },
  { startTime: 2 },
  { endTime: 8 },
  { opacity: .5 },
])("actual media and timeline edits invalidate the identity: %j", change => {
  const clip = { storagePath: "uploads/owner/source.mp4", startTime: 0, endTime: 12, opacity: 1 };
  expect(historyMediaIdentity({ ...clip, ...change })).not.toEqual(historyMediaIdentity(clip));
});

test("unbound media URL changes remain edits", () => {
  expect(historyMediaIdentity({ url: "blob:first" })).not.toEqual(historyMediaIdentity({ url: "blob:second" }));
});

test("owned subject playback refresh is not an undo step; effect and approval changes still are", () => {
  const item = { scene: { sourceStoragePath: "studio/owner/source.mp4", effects: [{ text: "Title" }] },
    preview: { jobId: "owned-job", revision: "same-edit", reviewed: true, receipt: { pixel_sha256: "same-pixels" } } };
  const before = historySubjectVfxIdentity({ ...item, preview: { ...item.preview, url: "https://storage/object?old" } });
  expect(historySubjectVfxIdentity({ ...item, preview: { ...item.preview, url: "https://storage/object?new" } })).toEqual(before);
  expect(historySubjectVfxIdentity({ ...item, preview: { ...item.preview, reviewed: false } })).not.toEqual(before);
  expect(historySubjectVfxIdentity({ ...item, scene: { ...item.scene, effects: [{ text: "Edited title" }] } })).not.toEqual(before);
});
