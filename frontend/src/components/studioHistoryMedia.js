// Signed playback links change when access is refreshed. The owned storage
// identity and all edit settings still determine whether this is a new edit.
export const historyMediaIdentity = item => {
  if (!item || !(item.sourceStoragePath || item.storagePath)) return item;
  const { url: _url, src: _src, previewUrl: _previewUrl, ...identity } = item;
  return identity;
};

export const historySubjectVfxIdentity = item => {
  if (!item?.preview?.jobId || !item.scene?.sourceStoragePath) return item;
  const { url: _url, ...preview } = item.preview;
  return { ...item, preview };
};
