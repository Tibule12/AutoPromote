// Owner-directed visibility applies equally to production, local builds and admins.
const hiddenPlatforms = new Set(['snapchat', 'twitter', 'x', 'pinterest', 'spotify']);
export const isPlatformVisible = platform => !hiddenPlatforms.has(String(platform || '').toLowerCase());
export function visiblePlatformSummary(value) {
  if (Array.isArray(value)) return value.filter(item => typeof item !== 'string' || isPlatformVisible(item)).map(visiblePlatformSummary);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => isPlatformVisible(key))
    .map(([key, item]) => [key, visiblePlatformSummary(item)]));
}
