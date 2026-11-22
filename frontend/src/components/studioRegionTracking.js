import {selectiveMaskAt,validateSelectiveMask} from './studioSelectiveMask';

const wait = ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function trackingTimes(start,end,direction=1,fps=8) {
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>12.01)throw Error('Track a continuous range up to twelve seconds.');
  const count=Math.ceil((end-start)*fps),times=Array.from({length:count+1},(_,i)=>Math.min(end,start+i/fps));
  return direction<0?times.reverse():times;
}

export async function captureRegionTracking({layer,start,end,direction=1,target='texture',faceContour=false,seek,getFrame,isCurrent,onProgress}) {
  if(!['texture','face'].includes(target))throw Error('Choose a supported tracking target.');
  const times=trackingTimes(start,end,direction),frames=[],sceneSamples=[];
  let width,height,crop,rect;
  const pose=selectiveMaskAt(layer.mask,Math.max(0,times[0]-layer.startTime));
  const full=document.createElement('canvas'),small=document.createElement('canvas'),scene=document.createElement('canvas');
  scene.width=16;scene.height=9;
  for(let index=0;index<times.length;index++) {
    if(!isCurrent())throw Error('Selection tracking cancelled.');
    await seek(times[index]);
    const deadline=performance.now()+10000;
    let sample;
    while(performance.now()<deadline) {
      if(!isCurrent())throw Error('Selection tracking cancelled.');
      sample=getFrame();
      if(sample?.layerId===layer.id&&Math.abs(sample.time-times[index])<1/45)break;
      sample=null;await wait(25);
    }
    if(!sample)throw Error('The programme did not settle at the requested frame. No tracking was applied.');
    const image=sample.image;
    if(!width) {
      rect={x:0,y:0,width:image.width,height:image.height};
      if(target==='face') {
        const side=Math.min(image.width,image.height,Math.max(pose.width*image.width*2.5,pose.height*image.height*2.5,Math.min(image.width,image.height)*.4));
        rect={x:Math.max(0,Math.min(image.width-side,pose.x*image.width-side/2)),y:Math.max(0,Math.min(image.height-side,pose.y*image.height-side/2)),width:side,height:side};
        crop={x:rect.x/image.width,y:rect.y/image.height,width:rect.width/image.width,height:rect.height/image.height};
      }
      const scale=Math.min(1,640/Math.max(rect.width,rect.height));
      width=Math.max(32,Math.round(rect.width*scale));height=Math.max(32,Math.round(rect.height*scale));
      if(width*height*times.length>39*1024*1024)throw Error('Shorten this tracking range.');
      small.width=width;small.height=height;full.width=image.width;full.height=image.height;
    }
    if(full.width!==image.width||full.height!==image.height)throw Error('The programme size changed during tracking.');
    full.getContext('2d').putImageData(image,0,0);
    if(target==='face') {
      const ctx=scene.getContext('2d',{willReadFrequently:true});ctx.drawImage(full,0,0,16,9);
      const rgba=ctx.getImageData(0,0,16,9).data;
      sceneSamples.push(Array.from({length:144},(_,p)=>Math.round(rgba[p*4]*.299+rgba[p*4+1]*.587+rgba[p*4+2]*.114)));
    }
    const ctx=small.getContext('2d',{willReadFrequently:true});ctx.drawImage(full,rect.x,rect.y,rect.width,rect.height,0,0,width,height);
    const rgba=ctx.getImageData(0,0,width,height).data,gray=new Uint8Array(width*height);
    for(let p=0;p<gray.length;p++)gray[p]=Math.round(rgba[p*4]*.299+rgba[p*4+1]*.587+rgba[p*4+2]*.114);
    frames.push(gray);onProgress?.(index+1,times.length);
  }
  const samplePose=crop?{...pose,x:(pose.x-crop.x)/crop.width,y:(pose.y-crop.y)/crop.height,width:pose.width/crop.width,height:pose.height/crop.height}:pose;
  const header=new TextEncoder().encode(JSON.stringify({width,height,times,target,faceContour,crop,...(target==='face'?{sceneSamples}:{}),mask:{...samplePose,keyframes:[],material:undefined,opacity:undefined}}));
  const prefix=new Uint8Array(12);prefix.set(new TextEncoder().encode('APGRD001'));new DataView(prefix.buffer).setUint32(8,header.length,true);
  return new Blob([prefix,header,...frames],{type:'application/octet-stream'});
}

export function applyRegionTracking(layer,result,requestedStart,requestedEnd,frameRate=30) {
  if(result?.version!==1||!Array.isArray(result.keyframes)||!result.keyframes.length||
      result.keyframes.some(k=>!Number.isFinite(k.time)||k.time<requestedStart-.001||k.time>requestedEnd+.001))throw Error('Tracking returned an invalid selection path.');
  const keys=result.keyframes.map(key=>({...key,time:Math.max(0,key.time-layer.startTime)}));
  const start=requestedStart-layer.startTime,end=requestedEnd-layer.startTime;
  // A loss is a hard visibility boundary, not a slow fade over an untracked
  // object. Backwards tracking needs the hold on the earlier (hidden) key.
  for(let i=0;i<keys.length-1;i++)if(keys[i].opacity!==keys[i+1].opacity)keys[i].hold=true;
  const retained=layer.mask.keyframes.filter(k=>k.time<start-.0001||k.time>end+.0001);
  // Do not carry a tracked pose into an unobserved part of a long region.
  if(start>1/frameRate&&!retained.some(k=>k.time<start))keys.unshift({...keys[0],time:start-1/frameRate,opacity:0,hold:true});
  if(end<layer.duration-1/frameRate&&!retained.some(k=>k.time>end)){
    keys[keys.length-1].hold=true;
    keys.push({...keys[keys.length-1],time:end+1/frameRate,opacity:0,hold:true});
  }
  const merged=[...retained,...keys].sort((a,b)=>a.time-b.time);
  if(merged.length>2048)throw Error('This region has reached 2048 motion keys. Start another region or clear unneeded keys.');
  if(result.shape!==undefined&&result.shape!=='polygon')throw Error('Tracking returned an unsupported outline.');
  const outline=result.shape==='polygon'?{shape:'polygon',points:keys[0].points}:{};
  // Do not silently change an earlier authored ellipse's interpolation schema.
  if(result.shape==='polygon'&&retained.length&&(layer.mask.shape!=='polygon'||layer.mask.points.length!==keys[0].points.length))throw Error('Clear the old motion keys before changing the tracked outline.');
  const next={...layer,mask:{...layer.mask,...outline,keyframes:merged},tracking:{engine:result.engine,
    range:[requestedStart,requestedEnd],stopReason:result.stopReason,reviewRequired:true,
    reviewTime:result.stopReason?result.keyframes.find(k=>k.opacity===0)?.time:undefined,
    observations:result.observations||[]}};
  validateSelectiveMask(next.mask);return next;
}

export async function trackRegionRange({layer,start,end,direction=1,target='texture',faceContour=false,frameRate=30,capture,analyze,isCurrent,onProgress}) {
  if(end<=start||end-start>60.01)throw Error('Choose a tracking range up to sixty seconds.');
  let working=layer,cursor=direction>0?start:end,samples=1,stopReason=null;
  const observations=[];
  while(direction>0?cursor<end-.001:cursor>start+.001) {
    if(!isCurrent())throw Error('Selection tracking cancelled.');
    const low=direction>0?cursor:Math.max(start,cursor-10),high=direction>0?Math.min(end,cursor+10):cursor;
    const packet=await capture({layer:working,start:low,end:high,direction,target,faceContour,
      onProgress:(done,total)=>onProgress?.({start:low,end:high,done,total})});
    if(!isCurrent())throw Error('Selection tracking cancelled.');
    const result=await analyze(packet);
    if(!isCurrent())throw Error('The edit changed; tracking was not applied.');
    if(target==='face'&&(result.engine!=='programme-face-mesh-v1'||result.shape!=='polygon'))throw Error('This worker does not support facial outlines. The selection is unchanged.');
    if(faceContour&&result.faceContour!==true)throw Error('This worker does not support the facial contour. The selection is unchanged.');
    working=applyRegionTracking(working,result,low,high,frameRate);
    observations.push(...(result.observations||[]));samples+=Math.max(0,(result.trackedSamples||result.keyframes.length)-1);
    stopReason=result.stopReason;
    if(stopReason)break;
    cursor=direction>0?high:low;
  }
  return {...working,tracking:{...working.tracking,target,faceContour,range:[start,end],observations,trackedSamples:samples,stopReason,reviewRequired:true}};
}

// Transfer an observed head/object path to a small local correction. This
// bakes editable keys; it does not invent features on a tiny blemish or claim
// that editing the reference later also changes this independent area.
export function inheritRegionMotion(layer,reference,time,aspect=16/9) {
  if(!reference?.mask?.keyframes?.length||!Number.isFinite(aspect)||aspect<=0)throw Error('Choose a tracked area in this edit.');
  const anchor=selectiveMaskAt(reference.mask,Math.max(0,time-reference.startTime));
  const child=selectiveMaskAt(layer.mask,Math.max(0,time-layer.startTime));
  const angle=anchor.rotation*Math.PI/180,dx=child.x-anchor.x,dy=child.y-anchor.y;
  const u=(dx*Math.cos(angle)+dy*Math.sin(angle)/aspect)/anchor.width;
  const v=(-dx*Math.sin(angle)*aspect+dy*Math.cos(angle))/anchor.height;
  const times=new Set([0,layer.duration,...reference.mask.keyframes.map(k=>k.time+reference.startTime-layer.startTime)]);
  const keys=[...times].filter(t=>t>=0&&t<=layer.duration).sort((a,b)=>a-b).map(localTime=>{
    const p=selectiveMaskAt(reference.mask,Math.max(0,localTime+layer.startTime-reference.startTime)),a=p.rotation*Math.PI/180;
    return {time:localTime,x:p.x+u*p.width*Math.cos(a)-v*p.height*Math.sin(a)/aspect,
      y:p.y+u*p.width*Math.sin(a)*aspect+v*p.height*Math.cos(a),
      width:child.width*p.width/anchor.width,height:child.height*p.height/anchor.height,
      rotation:child.rotation+p.rotation-anchor.rotation,
      opacity:p.opacity??1,...(child.points?{points:child.points.map(point=>[...point])}:{})};
  });
  // Preserve cut/loss boundaries when copying the path in programme time.
  for(let i=0;i<keys.length-1;i++)if(keys[i].opacity!==keys[i+1].opacity)keys[i].hold=true;
  const next={...layer,mask:{...layer.mask,keyframes:keys},tracking:{engine:'copied-programme-path-v1',referenceId:reference.id,reviewRequired:true}};
  validateSelectiveMask(next.mask);return next;
}
