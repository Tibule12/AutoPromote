export const CLIP_SELECTOR_VERSION = 'moments-v2';
export const CLIP_DESTINATIONS = {'TikTok':'tiktok','YouTube Shorts':'youtube_shorts','Instagram Reels':'instagram_reels'};

export function clipSelectionSettings(length='30–60 seconds', destinations=Object.keys(CLIP_DESTINATIONS), focus='') {
  const range={'15–30 seconds':[15,30],'30–60 seconds':[30,60],'60–90 seconds':[60,90]}[length]||[30,60];
  return {version:CLIP_SELECTOR_VERSION,minDuration:range[0],maxDuration:range[1],
    destinations:destinations.map(d=>CLIP_DESTINATIONS[d]||d).filter(d=>Object.values(CLIP_DESTINATIONS).includes(d)).sort(),
    focus:String(focus||'').trim().slice(0,200)};
}

export async function clipSettingsCacheKey(fingerprint, settings) {
  // The analytics token limit is 80 characters. Hash the complete identity
  // and preferences, rather than truncating away the source after a prefix.
  if(!globalThis.crypto?.subtle || typeof TextEncoder==='undefined')return null;
  const digest=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([fingerprint,settings])));
  return 'vc2_'+[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
