/* soundService
 * Minimal service for managing sound metadata and importing provider feeds
 */

async function addSound(db, sound = {}) {
  const doc = {
    title: sound.title || "Untitled",
    source: sound.source || "internal",
    providerId: sound.providerId || null,
    durationSec: typeof sound.durationSec === "number" ? sound.durationSec : 0,
    tags: Array.isArray(sound.tags) ? sound.tags : [],
    isLicensed: !!sound.isLicensed,
    licenseInfo: sound.licenseInfo || null,
    trendingScore: typeof sound.trendingScore === "number" ? sound.trendingScore : 0,
    uploaderUserId: sound.uploaderUserId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const ref = await db.collection("sounds").add(doc);
  return { id: ref.id, doc };
}

async function importFromProvider(db, providerName, feed = []) {
  if (!Array.isArray(feed)) throw new Error("feed must be an array");
  const added = [];
  for (const item of feed) {
    const sound = {
      title: item.title || `untitled-${providerName}`,
      source: "third_party",
      providerId: item.id,
      durationSec: typeof item.duration === "number" ? item.duration : item.durationSec || 0,
      tags: item.tags || [],
      isLicensed: !!item.isLicensed,
      licenseInfo: item.licenseInfo || null,
      trendingScore: typeof item.trendingScore === "number" ? item.trendingScore : 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ref = await db.collection("sounds").add(sound);
    added.push({ id: ref.id, doc: sound });
  }
  return added;
}

// Upsert a single provider sound by providerName + providerId (avoid duplicates)
async function upsertProviderSound(db, providerName, item = {}) {
  const providerId = item.id;
  if (!providerId) throw new Error("item.id (providerId) is required");

  // Try to find an existing doc
  const q = await db
    .collection("sounds")
    .where("source", "==", "third_party")
    .where("providerId", "==", providerId)
    .get();
  const docs = [];
  q.forEach(d => docs.push({ id: d.id, data: d.data() }));

  const payload = {
    title: item.title || `untitled-${providerName}`,
    source: "third_party",
    providerId,
    durationSec: typeof item.duration === "number" ? item.duration : item.durationSec || 0,
    tags: item.tags || [],
    isLicensed: !!item.isLicensed,
    licenseInfo: item.licenseInfo || null,
    // allow provider to provide a trendingScore, or default to 0
    trendingScore: typeof item.trendingScore === "number" ? item.trendingScore : 0,
    updatedAt: new Date().toISOString(),
  };

  if (docs.length > 0) {
    // update first match
    const docRef = docs[0];
    await db.collection("sounds").doc(docRef.id).update(payload);
    return { id: docRef.id, updated: true };
  }

  // insert
  const ref = await db
    .collection("sounds")
    .add({ ...payload, createdAt: new Date().toISOString() });
  return { id: ref.id, updated: false };
}

async function listSounds(db, { filter = "all", q, limit = 20 } = {}) {
  let qref = db.collection("sounds");
  if (filter === "trending") qref = qref.orderBy("trendingScore", "desc");
  else if (filter === "new") qref = qref.orderBy("createdAt", "desc");
  else qref = qref.orderBy("createdAt", "desc");

  if (typeof limit === "number") qref = qref.limit(limit);
  const snap = await qref.get();
  const results = [];
  snap.forEach(doc => {
    const d = doc.data();
    // crude client-side text filtering for the demo
    if (q && typeof d.title === "string" && !d.title.toLowerCase().includes(q.toLowerCase()))
      return;
    results.push({ id: doc.id, ...d });
  });
  return results;
}

module.exports = { addSound, importFromProvider, listSounds, upsertProviderSound };
