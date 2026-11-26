export const CLIP_SELECTOR_VERSION = 'moments-v2';
export const CLIP_DESTINATIONS = {'TikTok':'tiktok','YouTube Shorts':'youtube_shorts','Instagram Reels':'instagram_reels'};
export const DESTINATION_LABELS = {
  tiktok: 'TikTok',
  youtube_shorts: 'YouTube Shorts',
  instagram_reels: 'Instagram Reels',
};

const FORMAT_PROFILES = {
  youtube_shorts: { label: 'YouTube Shorts', idealMin: 15, idealMax: 58, hardMax: 60 },
  instagram_reels: { label: 'Instagram Reels', idealMin: 18, idealMax: 60, hardMax: 90 },
  tiktok: { label: 'TikTok', idealMin: 12, idealMax: 48, hardMax: 120 },
};

export function normalizeDestinationId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (CLIP_DESTINATIONS[raw]) return CLIP_DESTINATIONS[raw];
  const lower = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (lower === 'shorts' || lower === 'youtube_shorts') return 'youtube_shorts';
  if (lower === 'reels' || lower === 'instagram_reels') return 'instagram_reels';
  if (lower === 'tiktok') return 'tiktok';
  return '';
}

export function destinationDurationLimit(destination) {
  const id = normalizeDestinationId(destination);
  return FORMAT_PROFILES[id]?.hardMax || null;
}

export function destinationToExportTarget(destination) {
  const id = normalizeDestinationId(destination);
  if (id === 'youtube_shorts') return 'shorts';
  if (id === 'instagram_reels') return 'reels';
  if (id === 'tiktok') return 'tiktok';
  return 'general';
}

export function exportTargetToDestination(target) {
  return normalizeDestinationId(target);
}

export function clipSelectionSettings(length='30–60 seconds', destinations=Object.keys(CLIP_DESTINATIONS), focus='') {
  const range={'15–30 seconds':[15,30],'30–60 seconds':[30,60],'60–90 seconds':[60,90]}[length]||[30,60];
  return {version:CLIP_SELECTOR_VERSION,minDuration:range[0],maxDuration:range[1],
    destinations:destinations.map(d=>CLIP_DESTINATIONS[d]||d).filter(d=>Object.values(CLIP_DESTINATIONS).includes(d)).sort(),
    focus:String(focus||'').trim().slice(0,200)};
}

export function computeClipDestinationMeta(clip, selectedDestinations = []) {
  const activeIds = (Array.isArray(selectedDestinations) && selectedDestinations.length
    ? selectedDestinations.map(normalizeDestinationId).filter(Boolean)
    : Object.values(CLIP_DESTINATIONS));
  const uniqueIds = [...new Set(activeIds)];
  const existingScores = clip?.destinationScores && typeof clip.destinationScores === 'object' ? clip.destinationScores : null;
  const existingTags = Array.isArray(clip?.formatTags) ? clip.formatTags : [];
  const duration = Math.max(0, Number(clip?.duration ?? (Number(clip?.end || 0) - Number(clip?.start || 0))));
  const baseScore = Math.max(0, Math.min(96, Number(clip?.score ?? clip?.viralScore ?? 60)));

  const tags = uniqueIds.map(id => {
    const existingTag = existingTags.find(tag => tag?.id === id);
    if (existingTag && Number.isFinite(Number(existingTag.score))) {
      return { ...existingTag, aspect: existingTag.aspect || '9:16' };
    }
    const profile = FORMAT_PROFILES[id];
    let score = existingScores && Number.isFinite(Number(existingScores[id]))
      ? Number(existingScores[id])
      : baseScore;
    let note = null;
    if (!existingScores || !Number.isFinite(Number(existingScores[id]))) {
      const text = `${clip?.hookText || ''} ${clip?.reason || ''} ${clip?.text || ''}`.toLowerCase();
      if (duration > profile.hardMax) {
        score -= 18;
        note = `Trim to ${profile.hardMax}s or under for ${profile.label}`;
      } else if (duration >= profile.idealMin && duration <= profile.idealMax) {
        score += 5;
      }
      if (id === 'youtube_shorts' && /\b(how|why|lesson|explain|because|result|step)\b/.test(text)) score += 3;
      if (id === 'instagram_reels' && /\b(story|feel|moment|music|choir|motion|visual)\b/.test(text)) score += 3;
      if (id === 'tiktok' && /(\?|wait|stop|watch|secret|mistake|fast|energy)/.test(text)) score += 3;
      score = Math.round(Math.max(0, Math.min(96, score)) * 10) / 10;
    } else if (duration > profile.hardMax) {
      note = `Trim to ${profile.hardMax}s or under for ${profile.label}`;
    }
    const fit = duration > profile.hardMax ? 'Trim needed' : score >= 68 ? 'Strong fit' : 'Good fit';
    return { id, label: profile.label, aspect: '9:16', score, fit, note };
  }).sort((a, b) => b.score - a.score);

  const destinationScores = Object.fromEntries(tags.map(tag => [tag.id, tag.score]));
  const readyTag = tags.find(tag => tag.fit !== 'Trim needed');
  const recommendedDestination = (clip?.recommendedDestination && destinationScores[clip.recommendedDestination] !== undefined)
    ? clip.recommendedDestination
    : (readyTag?.id || tags[0]?.id || 'instagram_reels');
  return {
    destinationScores,
    formatTags: tags,
    recommendedDestination,
    targetAspectRatio: clip?.targetAspectRatio || '9:16',
  };
}

export function sortMomentsByFormat(clips, activeFormat = 'all', selectedDestinations = []) {
  const list = Array.isArray(clips) ? clips : [];
  const normalizedFormat = activeFormat === 'all' ? 'all' : normalizeDestinationId(activeFormat);
  return list
    .map(clip => {
      const meta = computeClipDestinationMeta(clip, selectedDestinations);
      const activeTag = normalizedFormat === 'all'
        ? (meta.formatTags.find(tag => tag.id === meta.recommendedDestination) || meta.formatTags[0])
        : meta.formatTags.find(tag => tag.id === normalizedFormat);
      const allReady = meta.formatTags.some(tag => tag.fit !== 'Trim needed');
      const readyForTarget = normalizedFormat === 'all' ? allReady : activeTag?.fit !== 'Trim needed';
      const sortScore = normalizedFormat === 'all'
        ? Number(clip?.score ?? clip?.viralScore ?? activeTag?.score ?? 0)
        : Number(activeTag?.score ?? clip?.score ?? clip?.viralScore ?? 0);
      return {
        ...clip,
        ...meta,
        readyForTarget,
        formatSortScore: sortScore,
      };
    })
    .sort((left, right) => {
      if (left.readyForTarget !== right.readyForTarget) return left.readyForTarget ? -1 : 1;
      if (right.formatSortScore !== left.formatSortScore) return right.formatSortScore - left.formatSortScore;
      const rightOverall = Number(right.score ?? right.viralScore ?? 0);
      const leftOverall = Number(left.score ?? left.viralScore ?? 0);
      if (rightOverall !== leftOverall) return rightOverall - leftOverall;
      return Number(left.start || 0) - Number(right.start || 0);
    });
}

export async function clipSettingsCacheKey(fingerprint, settings) {
  // The analytics token limit is 80 characters. Hash the complete identity
  // and preferences, rather than truncating away the source after a prefix.
  if(!globalThis.crypto?.subtle || typeof TextEncoder==='undefined')return null;
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([fingerprint,settings])));
  return 'vc2_'+[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
