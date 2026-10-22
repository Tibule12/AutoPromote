// Resolve replacement plates from the same owned canonical project. The worker
// receives generation-pinned bytes, never a URL or an approval flag from a browser.
const crypto = require('crypto');
const { hash } = require('../modelRuntime/contract');
const { resolveOwnedStudioMediaSource, getStudioSourceBucket } = require('./studioSourceService');
const invalid = () => Object.assign(new Error('The background changed or is not saved in this project.'), { statusCode: 409 });
const MAX_BYTES = 32 * 1024 ** 2;
async function resolveSubjectReplacementAssets({ ownerUid, projectId, scene, signFiles = true,
  firestore, resolveSource = resolveOwnedStudioMediaSource, bucketFor = getStudioSourceBucket }) {
  const effects = scene.effects.filter(effect => effect.type === 'background_replace');
  if (!effects.length) return [];
  const db = firestore || require('../firebaseAdmin').db;
  const head = await db.collection('users').doc(ownerUid).collection('studioDirectorProjects').doc(hash(projectId)).get();
  if (!head.exists) throw invalid();
  const parsed = require('./studioProjectRevisionService').parseStudioProjectHeadRecord(head.data(), ownerUid, projectId);
  const result = [];
  for (const effect of effects) {
    if (result.some(asset => asset.assetId === effect.asset_id)) {
      if (result.find(asset => asset.assetId === effect.asset_id).sha256 !== effect.asset_sha256) throw invalid();
      continue;
    }
    const asset = parsed.document.assets.find(asset => asset.sourceId === effect.asset_id || asset.assetId === effect.asset_id);
    if (!asset || asset.contentHash !== effect.asset_sha256) throw invalid();
    const source = await resolveSource({ userId: ownerUid, storagePath: asset.storagePath, signRead: false });
    if (!/^(image\/(png|jpeg|webp)|video\/[a-z0-9.+-]+)$/.test(source.contentType) ||
        !Number.isSafeInteger(source.size) || source.size < 1 || source.size > MAX_BYTES ||
        !/^[0-9]+$/.test(String(source.generation))) throw invalid();
    const generation = String(source.generation), file = bucketFor(source.kind).file(source.storagePath, { generation });
    const [metadata] = await file.getMetadata();
    if (metadata.metadata?.ownerUid !== ownerUid || String(metadata.generation) !== generation || Number(metadata.size) !== source.size)
      throw invalid();
    // Older image uploads have no server hash. Hash these bounded exact bytes
    // rather than accepting a browser-provided contentHash as an attestation.
    const digest = crypto.createHash('sha256'); let bytes = 0;
    for await (const chunk of file.createReadStream()) {
      bytes += chunk.length; if (bytes > source.size || bytes > MAX_BYTES) throw invalid(); digest.update(chunk);
    }
    if (bytes !== source.size || digest.digest('hex') !== effect.asset_sha256) throw invalid();
    const record = { assetId: effect.asset_id, sha256: effect.asset_sha256, generation, bytes, contentType: source.contentType };
    if (signFiles) [record.url] = await file.getSignedUrl({ action: 'read', expires: Date.now() + 20 * 60000, queryParams: { generation } });
    result.push(record);
  }
  return result.sort((a, b) => a.assetId.localeCompare(b.assetId));
}
const replacementIdentity = assets => assets.map(({ url, ...record }) => record);
module.exports = { resolveSubjectReplacementAssets, replacementIdentity };
