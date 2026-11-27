function assertAvailable(data) {
  if (
    ["deleting_after_publication", "deleted_after_publication"].includes(
      data?.storageRetentionStatus
    )
  )
    throw Object.assign(
      new Error(
        "The published video has expired from storage. Upload the file again to schedule another post."
      ),
      { status: 409, code: "PUBLISHED_MEDIA_EXPIRED" }
    );
}

async function writeMediaDependency(db, contentId, ref, value) {
  const content = db.collection("content").doc(contentId);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(content);
    if (!snapshot.exists) throw Object.assign(new Error("Content not found"), { status: 404 });
    assertAvailable(snapshot.data());
    transaction.set(ref, value);
    // Share a write with the cleanup claim so new work and expiry cannot win
    // concurrently after reading the same old content state.
    transaction.set(content, { lastMediaDependencyAt: new Date().toISOString() }, { merge: true });
  });
}
module.exports = { assertAvailable, writeMediaDependency };
