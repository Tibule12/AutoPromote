// Apply upload bindings to the same frozen render decisions and live editable
// snapshot. An import replaced while uploading keeps its newer local source.
export function bindStudioAudioSource(source, uploaded) {
  if (!source || !uploaded || source.url !== uploaded.priorUrl) return source;
  const { priorUrl, ...binding } = uploaded;
  return { ...source, ...binding, ...(binding.sourceStoragePath ? { file: null } : {}) };
}

export function bindStudioAudioSources(snapshot, { music, effects, voices }) {
  return { ...snapshot,
    musicTrack: bindStudioAudioSource(snapshot.musicTrack, music),
    soundEffects: (snapshot.soundEffects || []).map(effect => bindStudioAudioSource(effect, effects?.get(String(effect.id)))),
    voiceovers: (snapshot.voiceovers || []).map(take => bindStudioAudioSource(take, voices?.get(String(take.id)))),
  };
}

export function studioUploadedAudioBinding(source, upload) {
  return { priorUrl: source.url, url: upload.url,
    ...(upload.storagePath ? { sourceStoragePath: upload.storagePath, storagePath: upload.storagePath } : {}),
    ...(upload.ownerUid ? { ownerUid: upload.ownerUid } : {}),
    ...(upload.contentHash ? { contentHash: upload.contentHash } : {}),
  };
}
