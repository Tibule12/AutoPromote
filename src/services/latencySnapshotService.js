// Retain the existing 200-record history without transferring it every minute.
function createLatencySnapshotWriter({ db, now = Date.now } = {}) {
  let lastVersion = 0;
  return async (version, stats) => {
    if (!stats?.count || version === lastVersion) return false;
    const collection = db.collection("system_latency_snapshots");
    await collection.add({ at: now(), stats });
    lastVersion = version;
    const count = (await collection.count().get()).data().count;
    if (count > 220) {
      const excess = await collection
        .orderBy("at", "asc")
        .limit(Math.min(count - 200, 100))
        .select()
        .get();
      const batch = db.batch();
      excess.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    return true;
  };
}
module.exports = { createLatencySnapshotWriter };
