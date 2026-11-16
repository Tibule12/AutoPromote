// Preserve authored line breaks and a trailing newline while the user types.
// Text remains plain React/Pillow text; controls and angle brackets are removed.
export const normalizeStudioTitleText = value => String(value ?? '').replace(/\r\n?/g, '\n')
  // Intentionally remove control characters while retaining LF for typography.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/[<>]/g, '');

const titleBoxes=new Map();
let titleMeasure;
if(typeof document!=='undefined')document.fonts?.addEventListener?.('loadingdone',()=>titleBoxes.clear());
export function measureStudioTitleBox(layer,programmeWidth) {
  if(typeof document==='undefined')return null;
  const font=`${layer.fontWeight||900} 36px "Studio Inter", Inter, sans-serif`;
  const key=JSON.stringify([layer.text,layer.width,font,programmeWidth,document.fonts?.status]);
  if(titleBoxes.has(key))return titleBoxes.get(key);
  titleMeasure ||= document.createElement('canvas').getContext('2d');
  if(!titleMeasure)return null;
  titleMeasure.font=font;
  const maximum=programmeWidth*Math.max(.15,Math.min(.9,Number(layer.width||90)/100));
  const lines=[];
  for(const paragraph of normalizeStudioTitleText(layer.text).split('\n')){
    let line='';for(const word of paragraph.split(' ')){
      const candidate=line?line+' '+word:word;
      if(line&&titleMeasure.measureText(candidate).width>maximum-32){lines.push(line);line=word;}else line=candidate;
    }lines.push(line);
  }
  const result={lines,width:Math.min(maximum,Math.max(1,...lines.map(line=>titleMeasure.measureText(line).width))+32),height:lines.length*50.4+16};
  if(titleBoxes.size>=256)titleBoxes.delete(titleBoxes.keys().next().value);titleBoxes.set(key,result);return result;
}

// Title animation follows the edit clock, including paused scrubbing and exit.
export function titleAnimationPose(overlay, time) {
  const start = Number(overlay.startTime ?? overlay.start_time ?? 0);
  const duration = Math.max(0.05, Number(overlay.duration ?? 3));
  const animation = overlay.animation || {};
  const ease = progress => 1 - (1 - Math.max(0, Math.min(1, progress))) ** 3;
  const pose = { opacity: 1, scale: 1, x: 0, y: 0 };
  const apply = (type, progress) => {
    const remaining = 1 - ease(progress);
    if (!type || type === "none") return;
    pose.opacity *= 1 - remaining;
    if (type === "zoom") pose.scale *= 0.7 + 0.3 * (1 - remaining);
    if (type === "slideLeft") pose.x -= 10 * remaining;
    if (type === "slideRight") pose.x += 10 * remaining;
    if (type === "slideUp") pose.y -= 10 * remaining;
    if (type === "slideDown") pose.y += 10 * remaining;
  };
  apply(animation.enter, (time - start) / Math.max(0.001, Number(animation.enterDuration ?? 0.3)));
  apply(animation.exit, (start + duration - time) / Math.max(0.001, Number(animation.exitDuration ?? 0.3)));
  return pose;
}
