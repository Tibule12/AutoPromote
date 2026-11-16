import {studioNodeFilteredSurface} from './studioNodeEffects';
import {studioNodeTitleSurface} from './studioNodeTitleMask';
import {projectStudioCanvas} from './studioPerspective';
const KINDS=['PolygonMask','ChromaKeyer','MediaIn','Transform','CornerPin','GlowBlur'];
const gradeSurfaces=new WeakMap();
const branchMasks=new WeakMap();
function gradeSurface(context,name,width,height){
  let surfaces=gradeSurfaces.get(context);
  if(!surfaces){surfaces={};gradeSurfaces.set(context,surfaces);}
  const canvas=surfaces[name]||(surfaces[name]=document.createElement('canvas'));
  if(canvas.width!==width)canvas.width=width;
  if(canvas.height!==height)canvas.height=height;
  return canvas;
}
// Programme pictures are opaque. Preserve them as a canvas instead of reading
// every pixel back from the compositor before each masked grade.
export function captureStudioGradeSurface(context){
  const {width,height}=context.canvas,canvas=gradeSurface(context,'original',width,height),copy=canvas.getContext('2d');
  copy.globalCompositeOperation='copy';copy.drawImage(context.canvas,0,0);copy.globalCompositeOperation='source-over';
  return canvas;
}
export function compileStudioNodeMask(nodeId,overlays=[],invert=false) {
  if(!nodeId)return null;
  const at=String(nodeId).indexOf(':'),kind=String(nodeId).slice(0,at),id=String(nodeId).slice(at+1),layer=overlays.find(o=>String(o.id)===id);
  if(!KINDS.includes(kind)||!layer||!['image','video','text'].includes(layer.type)||layer.isNullRig||layer.isCaption||layer.bRollPlaceholder)throw Error('Connect a mask from a rendered image, video or title branch.');
  if(layer.type==='text'&&['ChromaKeyer','CornerPin'].includes(kind))throw Error('Keying and Corner Pin require image or video pixels.');
  return {layer_id:id,operation:kind,...(invert?{invert:true}:{})};
}
export function nodeMaskLayer(layer,operation) {
  const out={...layer};
  if(!['CornerPin','GlowBlur'].includes(operation))delete out.perspective;
  if(operation==='MediaIn'){out.chromaKey={enabled:false};out.mask={enabled:false};out.x=50;out.y=50;out.scale=1;out.rotation=0;out.parentId=null;out.motionDrivers={};out.parameterLinks={};out.zDepth=0;}
  if(['MediaIn','ChromaKeyer','PolygonMask'].includes(operation)){out.opticalFx={};out.displacementWarp={enabled:false};out.glow={enabled:false};out.layerShadow={enabled:false};out.blur=0;out.dofBlur=0;}
  if(['MediaIn','ChromaKeyer','CornerPin'].includes(operation))out.mask={enabled:false};
  return out;
}

// Blend a grade through an actual branch raster, at the decoded programme time.
export function blendStudioNodeMask(context,original,nodeId,{overlays,keys=[],mainTransform,time,width,height,evaluatePose,paintSurface,parsePolygon,invert=false}) {
  if(!nodeId||!original)return;
  const ref=compileStudioNodeMask(nodeId,overlays),input=overlays.find(o=>String(o.id)===ref.layer_id),layer=nodeMaskLayer(input,ref.operation);
  let pose=ref.operation==='MediaIn'?{x:50,y:50,scale:1,rotation:0,opacity:1}:evaluatePose(layer,overlays,keys,time,mainTransform);
  const start=Number(layer.startTime||0),active=time>=start&&time<start+Number(layer.duration||0);
  const node=[...document.querySelectorAll('[data-studio-layer-id]')].find(n=>n.dataset.studioLayerId===ref.layer_id&&!n.closest('.ap-flow-native-signal'));
  const video=node?.querySelector('[data-studio-overlay-decoder]'),shared=node?.querySelector('[data-studio-shared-video]');
  const picture=node?.querySelector('img')||(video?.dataset.sharedProgrammeFrame==='true'&&shared?.dataset.sourceTime!==undefined?shared:video);
  // Static masks only change when their source or evaluated pose changes.
  // Dynamic media/title/warp branches keep their own programme-time identity.
  const changingPixels=layer.type==='video'||layer.textAnimator||layer.displacementWarp?.enabled||
    (layer.animation?.enter&&layer.animation.enter!=='none')||(layer.animation?.exit&&layer.animation.exit!=='none');
  const identity=JSON.stringify([layer,pose,width,height,active,
    changingPixels?time:0,
    picture?.currentSrc,picture?.src,picture?.naturalWidth,picture?.readyState,shared?.dataset.sourceTime,document.fonts?.status]);
  let cache=branchMasks.get(context);if(!cache){cache=new Map();branchMasks.set(context,cache);}
  let entry=cache.get(nodeId);
  if(!entry){if(cache.size>=16)cache.delete(cache.keys().next().value);entry={canvas:document.createElement('canvas')};cache.set(nodeId,entry);}
  const canvas=entry.canvas;if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
  const mask=canvas.getContext('2d'),repaint=entry.identity!==identity;
  if(repaint){mask.setTransform(1,0,0,1,0,0);mask.globalAlpha=1;mask.globalCompositeOperation='source-over';mask.clearRect(0,0,width,height);}
  if(active&&repaint){
    const title=layer.type==='text'?studioNodeTitleSurface(layer,pose,time,width,height):null;
    let anchorX=Number(layer.anchorX??50),anchorY=Number(layer.anchorY??50);
    if(title){anchorX=title.anchorX;anchorY=title.anchorY;if(ref.operation!=='MediaIn')pose={...pose,x:pose.x+title.entrance.x,y:pose.y+title.entrance.y,opacity:pose.opacity*title.entrance.opacity};}
    let local=title?.canvas||document.createElement('canvas');
    if(!title){local.width=Math.max(2,Math.round(width*Number(layer.width||35)/100*pose.scale));local.height=Math.max(2,Math.round(height*Number(layer.height||35)/100*pose.scale));}
    let c=local.getContext('2d');
    const paintLocalMask=()=>{
      const m=pose.mask||layer.mask||{};
      const shape=(value)=>{const maskCanvas=document.createElement('canvas');maskCanvas.width=local.width;maskCanvas.height=local.height;const ctx=maskCanvas.getContext('2d');ctx.fillStyle='white';ctx.beginPath();
        if(value.enabled&&value.shape==='ellipse')ctx.ellipse(local.width/2,local.height/2,local.width*.48,local.height*.48,0,0,Math.PI*2);
        else if(value.enabled&&value.shape==='polygon'){parsePolygon(value.path).forEach(([x,y],i)=>{if(i)ctx.lineTo(x*local.width/100,y*local.height/100);else ctx.moveTo(x*local.width/100,y*local.height/100)});ctx.closePath();}
        else ctx.roundRect(0,0,local.width,local.height,Math.min(local.width,local.height)*Number(value.radius??6)/100);
        ctx.fill();if(value.feather){const blur=document.createElement('canvas');blur.width=local.width;blur.height=local.height;blur.getContext('2d').drawImage(maskCanvas,0,0);ctx.clearRect(0,0,local.width,local.height);ctx.filter=`blur(${value.feather*height/720*pose.scale}px)`;ctx.drawImage(blur,0,0);ctx.filter='none';}if(value.inverted){ctx.globalCompositeOperation='xor';ctx.fillRect(0,0,local.width,local.height);ctx.globalCompositeOperation='source-over';}return maskCanvas;};
      const draw=(value)=>c.drawImage(shape(value),0,0);
      draw(m);for(const sub of m.secondaryMasks||[]){c.globalCompositeOperation={add:'source-over',subtract:'destination-out',intersect:'destination-in',difference:'xor'}[sub.booleanOp||m.booleanMode||'add'];draw({...sub,enabled:true});}c.globalCompositeOperation='source-over';
    };
    if(ref.operation==='PolygonMask'){paintLocalMask();
    }else{
      if(!title&&picture&&(picture.tagName!=='VIDEO'||picture.readyState>=2))paintSurface(local,picture,layer,time,height*pose.scale);
      if(layer.perspective)projectStudioCanvas(local,pose.perspective||layer.perspective,pose.perspectiveProgress??100);
      const filtered=studioNodeFilteredSurface(local,layer,height/720*pose.scale,!!layer.mask?.enabled);
      if(filtered.canvas!==local){const w=local.width,h=local.height;local=filtered.canvas;c=local.getContext('2d');anchorX=(filtered.padding+w*anchorX/100)/local.width*100;anchorY=(filtered.padding+h*anchorY/100)/local.height*100;}
      if(layer.mask?.enabled){const raw=document.createElement('canvas');raw.width=local.width;raw.height=local.height;raw.getContext('2d').drawImage(local,0,0);c.clearRect(0,0,local.width,local.height);paintLocalMask();c.globalCompositeOperation='source-in';c.drawImage(raw,0,0);c.globalCompositeOperation='source-over';}
    }
    mask.globalAlpha=Number(pose.opacity??1);mask.translate(width*pose.x/100,height*pose.y/100);mask.rotate(pose.rotation*Math.PI/180);if(title&&ref.operation!=='MediaIn')mask.scale(title.entrance.scale,title.entrance.scale);mask.drawImage(local,-local.width*anchorX/100,-local.height*anchorY/100);
  }
  entry.identity=identity;
  if(!original.data){
    const graded=gradeSurface(context,'graded',width,height),blend=graded.getContext('2d');
    blend.globalCompositeOperation='copy';blend.drawImage(context.canvas,0,0);
    blend.globalCompositeOperation=invert?'destination-out':'destination-in';blend.drawImage(canvas,0,0);blend.globalCompositeOperation='source-over';
    context.save();context.setTransform(1,0,0,1,0,0);context.filter='none';context.globalAlpha=1;
    context.globalCompositeOperation='copy';context.drawImage(original,0,0);context.globalCompositeOperation='source-over';context.drawImage(graded,0,0);context.restore();
    return;
  }
  const coverage=mask.getImageData(0,0,width,height).data,changed=context.getImageData(0,0,width,height);
  for(let i=0;i<changed.data.length;i+=4){const a=invert?1-coverage[i+3]/255:coverage[i+3]/255;for(let c=0;c<4;c++)changed.data[i+c]=original.data[i+c]+(changed.data[i+c]-original.data[i+c])*a;}
  context.putImageData(changed,0,0);
}
