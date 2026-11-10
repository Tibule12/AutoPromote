// Effects on the isolated, stage-sized result, after its track matte.
export function validateStudioMatteSurface(v) {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v) || Object.keys(v).some(k=>!['enabled','glowColor','glowRadius','glowIntensity','reflectionEnabled','floorY','reflectionOpacity','fadeHeight'].includes(k)) ||
      typeof v.enabled !== 'boolean' || typeof v.reflectionEnabled !== 'boolean' || !/^#[a-f0-9]{6}$/i.test(v.glowColor||'')) throw Error('Choose valid isolated-surface effects.');
  for (const [k,lo,hi]of [['glowRadius',0,24],['glowIntensity',0,1],['floorY',20,95],['reflectionOpacity',0,.8],['fadeHeight',3,45]])
    if(typeof v[k]!=='number'||!Number.isFinite(v[k])||v[k]<lo||v[k]>hi)throw Error(`Invalid surface ${k}.`);
  return {...v};
}
export function studioMatteSurfaceStyle(v,stageHeight=720) {
  const s=validateStudioMatteSurface(v);if(!s?.enabled)return {};
  const px=stageHeight/720,rgb=[1,3,5].map(i=>parseInt(s.glowColor.slice(i,i+2),16));
  return {filter:s.glowIntensity>0?`drop-shadow(0 0 ${s.glowRadius*px}px rgba(${rgb.join(',')},${s.glowIntensity}))`:'none',
    WebkitBoxReflect:s.reflectionEnabled?`below ${2*(s.floorY/100-1)*stageHeight}px linear-gradient(to bottom, transparent ${s.floorY-s.fadeHeight}%, rgba(0,0,0,${s.reflectionOpacity}) ${s.floorY}%, rgba(0,0,0,${s.reflectionOpacity}) 100%)`:'none'};
}
