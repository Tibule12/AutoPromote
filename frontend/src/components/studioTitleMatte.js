import glyphs from './motion/titleGlyphs.v1.json';
import metrics from './motion/textMetrics.v1.json';
import {titleAnimationPose} from './studioTitleLayout';

// Self-contained SVG paths avoid a data-URL SVG silently falling back to a
// different system font. These are the same bundled Inter font outlines, not a
// special FRAME effect. Ordinary title metrics remain 36px / 50.4px at 720h.
export function studioTitleMatteMarkup(layer,pose,stageAspect,time,fill){
  const weight=String(layer.fontWeight||900),font=glyphs.weights[weight],metric=metrics.weights[weight];
  const text=String(layer.text||'');
  if(!font||!metric||[...text].some(c=>c!=='\n'&&!font.glyphs[c]))return null;
  const maximum=720*stageAspect*Math.max(.15,Math.min(.9,Number(layer.width||90)/100));
  const length=value=>[...value].reduce((sum,c)=>sum+font.glyphs[c].advance,0);
  const lines=[];
  for(const paragraph of text.split('\n')){
    let line='';for(const word of paragraph.split(' ')){
      const candidate=line+(line?' ':'')+word;
      if(line&&length(candidate)>maximum-32){lines.push(line);line=word;}else line=candidate;
    }lines.push(line);
  }
  const width=Math.min(maximum,Math.max(1,...lines.map(length))+32),height=50.4*lines.length+16;
  const ax=Number(layer.anchorX??50)/100,ay=Number(layer.anchorY??50)/100;
  const animation=titleAnimationPose(layer,time),unit=36/font.unitsPerEm;
  const scale=Number(pose.scale??1)*animation.scale;
  let markup='';
  lines.forEach((line,index)=>{
    const lineWidth=length(line);let cursor=layer.textAlign==='left'?16:layer.textAlign==='right'?width-16-lineWidth:(width-lineWidth)/2;
    const baseline=8+index*50.4+(50.4-metric.ascent-metric.descent)/2+metric.ascent;
    for(const char of line){const g=font.glyphs[char];if(g.path)markup+=`<path d="${g.path}" transform="translate(${cursor-width*ax} ${baseline-height*ay}) scale(${unit} ${-unit})"/>`;cursor+=g.advance;}
  });
  return `<g fill="${fill}" transform="scale(${scale})" opacity="${animation.opacity}">${markup}</g>`;
}
