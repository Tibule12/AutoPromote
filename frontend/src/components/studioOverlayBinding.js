// Older saved layers use the original source ID. Split replaces occurrence IDs
// while retaining sourceClipId; retain that legacy binding only when no exact
// occurrence owns the ID. An explicit occurrence always wins over a source.
export function studioOverlayBelongsToClip(overlay, clip, timeline = []) {
  if (overlay.bRollMode || !overlay.clipId) return true;
  if (!clip) return false;
  if (overlay.clipId === clip.id) return true;
  if (timeline.some(item => item.id === overlay.clipId)) return false;
  return overlay.clipId === clip.sourceClipId;
}
