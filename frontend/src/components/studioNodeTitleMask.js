import {normalizeStudioTitleText,titleAnimationPose,measureStudioTitleBox} from './studioTitleLayout';
import {studioTitleMatteMarkup} from './studioTitleMatte';
import {layoutStudioAnimatedText,studioTextAnimatorPoses} from './studioTextAnimator';
import {applyStudioNodeEffects,compileStudioNodeEffects,hasStudioNodeEffects,studioNodeFilteredSurface} from './studioNodeEffects';

// Title alpha uses the authored title/font/unit layout and programme clock.
// The worker supplies the matching native title asset to its existing rasterizer.
export function studioNodeTitleSurface(layer,pose,time,width,height) {
  const scale=height/720*pose.scale,programmeWidth=width*720/height;
  const canvas=document.createElement('canvas'),measure=canvas.getContext('2d');
  measure.font=`${layer.fontWeight||900} 36px "Studio Inter", Inter, sans-serif`;
  const animated=!!layer.textAnimator,layout=animated?layoutStudioAnimatedText(layer,programmeWidth):null;
  const maximumWidth=programmeWidth*Math.max(.15,Math.min(.9,Number(layer.width||90)/100));
  const lines=[];if(!animated)for(const paragraph of normalizeStudioTitleText(layer.text).split('\n')){
    if(!paragraph){lines.push('');continue;}let line='';for(const word of paragraph.split(/\s+/)){const candidate=line?line+' '+word:word;if(line&&measure.measureText(candidate).width>maximumWidth-32){lines.push(line);line=word;}else line=candidate;}lines.push(line);
  }
  const boxWidth=animated?layout.width:Math.min(maximumWidth,Math.max(1,...lines.map(t=>measure.measureText(t).width))+32),boxHeight=animated?layout.height:lines.length*50.4+16;
  const spec=layer.textAnimator;
  const margin=animated?Math.ceil(56+36*Math.max(Math.abs(spec.fromX),Math.abs(spec.fromY))+Math.max(layout.width,layout.height)*Math.abs(spec.tracking)/2+Math.max(36,...layout.units.map(u=>Math.hypot(u.width,50.4)))*(Math.max(1,spec.fromScale)+.2)/2):24;
  canvas.width=Math.max(2,Math.ceil((boxWidth+margin*2)*scale));canvas.height=Math.max(2,Math.ceil((boxHeight+margin*2)*scale));
  const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.scale(scale,scale);ctx.translate(margin,margin);
  ctx.fillStyle=layer.bg||'transparent';ctx.beginPath();ctx.roundRect(0,0,boxWidth,boxHeight,10);ctx.fill();
  ctx.font=`${layer.fontWeight||900} 36px "Studio Inter", Inter, sans-serif`;ctx.fillStyle=layer.color||'#ffffff';ctx.strokeStyle=layer.strokeColor||'rgba(0,0,0,.92)';ctx.lineWidth=Math.max(0,Number(layer.strokeWidth||0));
  const shadow=layer.shadow||'soft';if(shadow!=='none'){ctx.shadowColor=shadow==='strong'?'rgba(0,0,0,.95)':'rgba(0,0,0,.72)';ctx.shadowBlur=(shadow==='strong'?14:10)*scale;ctx.shadowOffsetY=(shadow==='strong'?4:3)*scale;}
  const glyph=(text,x,y)=>{if(ctx.lineWidth>0)ctx.strokeText(text,x,y);ctx.fillText(text,x,y);};
  if(animated){const poses=studioTextAnimatorPoses(spec,pose.textProgress??100,layout);ctx.translate(16,8);for(let i=0;i<layout.units.length;i++){const unit=layout.units[i],p=poses[i],cx=unit.x+unit.width/2,cy=unit.y+25.2;ctx.save();ctx.globalAlpha=p.opacity;ctx.translate(cx+p.x,cy+p.y);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(p.scale,p.scale);ctx.translate(-cx,-cy);for(const g of unit.glyphs)glyph(g.char,g.x,g.baseline);ctx.restore();}}
  else {const metrics=measure.measureText('Mg'),ascent=metrics.fontBoundingBoxAscent??34,descent=metrics.fontBoundingBoxDescent??9;lines.forEach((line,i)=>{const length=measure.measureText(line).width,x=layer.textAlign==='left'?16:layer.textAlign==='right'?boxWidth-16-length:(boxWidth-length)/2;glyph(line,x,8+i*50.4+(50.4-ascent-descent)/2+ascent);});}
  ctx.setTransform(1,0,0,1,0,0);
  if(hasStudioNodeEffects(layer)){const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);applyStudioNodeEffects(pixels.data,canvas.width,canvas.height,compileStudioNodeEffects(layer),time,scale);ctx.putImageData(pixels,0,0);}
  const entrance=titleAnimationPose(layer,time);
  return {canvas,anchorX:(margin+boxWidth*Number(layer.anchorX??50)/100)/(boxWidth+margin*2)*100,anchorY:(margin+boxHeight*Number(layer.anchorY??50)/100)/(boxHeight+margin*2)*100,entrance};
}

// Cache shaped title pixels; the browser applies pose and luma coverage in SVG.
// Re-encoding a full programme mask on every decoded picture stalls playback.
const titleTrackPictures=new Map();
const escapeTitleAttribute=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
export function studioTitleTrackMatteUri(layer,pose,time,width,height,mode,quality='inspection') {
  if(typeof document==='undefined')return null;
  const probe=document.createElement('canvas').getContext('2d');
  if(!probe?.getImageData||!probe?.drawImage||!probe?.roundRect)return null;
  const aspect=width/height,key=JSON.stringify([layer,aspect,document.fonts?.status,quality]);
  let picture=titleTrackPictures.get(key);
  if(!picture){
    const layout=measureStudioTitleBox(layer,720*aspect);
    const paths=Number(layer.strokeWidth)>0?null:studioTitleMatteMarkup({...layer,animation:{}},{scale:1},aspect,0,escapeTitleAttribute(layer.color||'#ffffff'));
    if(paths&&layout){
      const ax=Number(layer.anchorX??50)/100,ay=Number(layer.anchorY??50)/100;
      const background=layer.bg&&layer.bg!=='transparent'?`<rect x="${-layout.width*ax}" y="${-layout.height*ay}" width="${layout.width}" height="${layout.height}" rx="10" fill="${escapeTitleAttribute(layer.bg)}"/>`:'';
      const shadow=layer.shadow||'soft',blur=shadow==='strong'?7:5,dy=shadow==='strong'?4:3,opacity=shadow==='strong'?.95:.72;
      const filter=shadow==='none'||quality==='playback'?'':`<defs><filter id="title-shadow" x="-50%" y="-100%" width="200%" height="300%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="${dy}" stdDeviation="${blur}" flood-color="black" flood-opacity="${opacity}"/></filter></defs>`;
      picture={markup:`${background}${filter}<g${filter?' filter="url(#title-shadow)"':''}>${paths}</g>`};
    }else{
    const title=studioNodeTitleSurface(layer,{scale:4},0,720*aspect,720);
    const filtered=studioNodeFilteredSurface(title.canvas,layer,4);
    picture={url:filtered.canvas.toDataURL(),width:filtered.canvas.width/4,height:filtered.canvas.height/4,
      x:(title.canvas.width*title.anchorX/100+filtered.padding)/4,
      y:(title.canvas.height*title.anchorY/100+filtered.padding)/4};
    }
    if(titleTrackPictures.size>=32)titleTrackPictures.delete(titleTrackPictures.keys().next().value);
    titleTrackPictures.set(key,picture);
  }
  const start=Number(layer.startTime??0),end=start+Math.max(.05,Number(layer.duration??9999));
  const entrance=titleAnimationPose(layer,time),active=time>=start&&time<end;
  const luma=mode.startsWith('luma'),invert=mode.endsWith('_inverted');
  const filter=luma?`<feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 .2126 .7152 .0722 0 0" result="luma"/><feComposite in="luma" in2="SourceGraphic" operator="in"/>`:'';
  const invertFilter=invert?'<feComponentTransfer><feFuncA type="table" tableValues="1 0"/></feComponentTransfer>':'';
  const scale=Number(pose.scale??1)*entrance.scale;
  const content=picture.markup||`<image x="${-picture.x}" y="${-picture.y}" width="${picture.width}" height="${picture.height}" xlink:href="${picture.url}"/>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${720*aspect} 720"><defs><filter id="coverage" x="0" y="0" width="100%" height="100%" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${filter}${invertFilter}</filter></defs><g${luma||invert?' filter="url(#coverage)"':''}><rect width="100%" height="100%" fill="white" fill-opacity="0"/><g transform="translate(${720*aspect*(Number(pose.x??50)+entrance.x)/100} ${720*(Number(pose.y??50)+entrance.y)/100}) rotate(${Number(pose.rotation??0)}) scale(${scale})" opacity="${active?Number(pose.opacity??1)*entrance.opacity:0}">${content}</g></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function paintStudioTitleMattePose(node,layer,pose,time,aspect) {
  if(!node)return;
  const entrance=titleAnimationPose(layer,time),start=Number(layer.startTime??0),end=start+Math.max(.05,Number(layer.duration??9999));
  const transform=`translate(${720*aspect*(Number(pose.x??50)+entrance.x)/100} ${720*(Number(pose.y??50)+entrance.y)/100}) rotate(${Number(pose.rotation??0)}) scale(${Number(pose.scale??1)*entrance.scale})`;
  const opacity=String(time>=start&&time<end?Number(pose.opacity??1)*entrance.opacity:0);
  if(node.getAttribute('transform')!==transform)node.setAttribute('transform',transform);
  if(node.getAttribute('opacity')!==opacity)node.setAttribute('opacity',opacity);
}
