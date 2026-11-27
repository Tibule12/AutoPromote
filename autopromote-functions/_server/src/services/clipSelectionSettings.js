const DESTINATIONS=new Set(['tiktok','youtube_shorts','instagram_reels']);
function normalizeClipSelectionSettings(value) {
  if(value===undefined||value===null)return {version:'moments-v2',minDuration:30,maxDuration:60,destinations:[...DESTINATIONS].sort(),focus:''};
  if(typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','minDuration','maxDuration','destinations','focus'].includes(k)))throw Object.assign(new Error('Invalid clip settings.'),{statusCode:400});
  const min=Number(value.minDuration),max=Number(value.maxDuration);
  if(!Number.isFinite(min)||!Number.isFinite(max)||min<5||max>120||max<min||!Array.isArray(value.destinations)||!value.destinations.length||value.destinations.some(d=>!DESTINATIONS.has(d))||typeof value.focus!=='string'||value.focus.length>200)throw Object.assign(new Error('Choose a valid clip length, at least one destination and a brief of up to 200 characters.'),{statusCode:400});
  return {version:'moments-v2',minDuration:min,maxDuration:max,destinations:[...new Set(value.destinations)].sort(),focus:value.focus.trim()};
}
module.exports={normalizeClipSelectionSettings};
