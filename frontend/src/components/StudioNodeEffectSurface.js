import React, { useLayoutEffect, useRef } from 'react';
import { hasStudioNodeSurface, paintStudioNodeSurface, studioNodeFilteredSurface } from './studioNodeEffects';
import {projectStudioCanvas} from './studioPerspective';
import {evaluateWorldLayerPose} from './studioCompRigging';
import { watchStudioProgrammeFrames } from './studioSourcePreview';

// Replace only the native media surface, retaining the ordinary decoder, layer
// geometry, audio, masking, selection and history. Failed reads stay explicit.
export default function StudioNodeEffectSurface({ layer, videoRef, mapTime, time, overlays=[],keyframes=[],mainTransform,programmeHeight=720 }) {
  const canvasRef=useRef(null), latest=useRef(null),paintedRef=useRef(null);latest.current={layer,mapTime,time,overlays,keyframes,mainTransform,programmeHeight};
  useLayoutEffect(()=>{
    const canvas=canvasRef.current, node=canvas?.closest('[data-studio-layer-id]'), clock=videoRef?.current;
    if(!canvas||!node)return undefined;
    const image=node.querySelector('img'),video=node.querySelector('[data-studio-overlay-decoder]'),shared=node.querySelector('[data-studio-shared-video]');
    const stage=node.closest('[data-testid="hook-preview-frame"]')||node.parentElement;
    const local=document.createElement('canvas');
    let width=0,height=0,displayHeight=720;
    const measure=()=>{const css=getComputedStyle(node);width=Math.max(2,parseFloat(css.width)||node.clientWidth);height=Math.max(2,parseFloat(css.height)||node.clientHeight);displayHeight=stage.clientHeight||720;};measure();
    const paint=sourceTime=>{
      const state=latest.current;
      const source=image || (video?.dataset.sharedProgrammeFrame==='true'&&shared?.dataset.sourceTime!==undefined?shared:video);
      if(!source||(image&&!image.complete)||(source===video&&(video.seeking||video.readyState<2)))return;
      // Paused inspection uses the delivery raster before scaling to the
      // monitor, as the main programme does. Moving paint keeps its bounded
      // display raster. Effect radii and keyer edges therefore retain detail.
      const animatedPixels=state.layer.displacementWarp?.enabled||state.keyframes.some(key=>String(key.targetId)===String(state.layer.id)&&
        /^(planeCorner|perspectiveProgress|maskPoint|strokeStart|strokeEnd|strokeOffset)/.test(key.property));
      // A still's cached delivery bitmap is already ready when Play starts.
      // Keep those pixels through playback instead of rebuilding its key,
      // homography and glow just to obtain a smaller version of the same image.
      const density=clock?.paused||(image&&!animatedPixels)?Math.max(1,Number(state.programmeHeight)/displayHeight):1;
      const w=Math.max(2,Math.round(width*density)),h=Math.max(2,Math.round(height*density));
      const programmeHeight=displayHeight*density;
      const at=state.mapTime?state.mapTime(sourceTime):state.time;
      const pose=state.layer.perspective?evaluateWorldLayerPose(state.layer,state.overlays,state.keyframes,at,state.mainTransform):null;
      const staticKey=image&&!state.layer.displacementWarp?.enabled
        ? JSON.stringify([image.currentSrc||image.src,image.naturalWidth,image.naturalHeight,state.layer,w,h,programmeHeight,pose?.perspective,pose?.perspectiveProgress]) : null;
      const reused=staticKey&&paintedRef.current?.canvas===canvas&&paintedRef.current.key===staticKey;
      let padding=reused?paintedRef.current.padding:0;
      try {if(!reused){
        if(local.width!==w)local.width=w;if(local.height!==h)local.height=h;
        if(!paintStudioNodeSurface(local,source,state.layer,at,programmeHeight))return;
        if((state.layer.frameShape||'round')!=='edge'&&state.layer.bRollMode!=='fullscreen'){
          const ctx=local.getContext('2d'),radius=Math.max(12,Math.min(48,Number(state.layer.borderRadius??28)))/400;
          ctx.globalCompositeOperation='destination-in';ctx.fillStyle='white';ctx.beginPath();ctx.roundRect(0,0,w,h,[{x:w*radius,y:h*radius}]);ctx.fill();ctx.globalCompositeOperation='source-over';
        }
        if(state.layer.perspective)projectStudioCanvas(local,pose?.perspective||state.layer.perspective,pose?.perspectiveProgress??100);
        const filtered=studioNodeFilteredSurface(local,state.layer,programmeHeight/720,!!state.layer.mask?.enabled);padding=filtered.padding;
        if(canvas.width!==filtered.canvas.width)canvas.width=filtered.canvas.width;if(canvas.height!==filtered.canvas.height)canvas.height=filtered.canvas.height;
        const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(filtered.canvas,0,0);
        canvas.dataset.pixelRevision=String(Number(canvas.dataset.pixelRevision||0)+1);
      }
        // The same delivery bitmap survives a monitor resize. Its CSS size
        // must still follow the new density even when no pixels need repaint.
        const presentation=`${w}:${h}:${padding}:${density}`;
        if(canvas.dataset.presentation!==presentation){
          Object.assign(canvas.style,{left:`${-padding/density}px`,top:`${-padding/density}px`,right:'auto',bottom:'auto',width:`${(w+padding*2)/density}px`,height:`${(h+padding*2)/density}px`,maxWidth:'none',maxHeight:'none'});
          canvas.dataset.rasterDensity=String(density);canvas.dataset.presentation=presentation;
        }
        paintedRef.current=staticKey?{canvas,key:staticKey,padding}:null;
        canvas.style.display='block';canvas.dataset.nodeEffectError='';canvas.dataset.programmeTime=String(state.mapTime?state.mapTime(sourceTime):state.time);
        for(const raw of [image,video,shared])if(raw)raw.style.visibility='hidden';
      }catch(error){canvas.dataset.nodeEffectError=error.message;canvas.style.display='none';}
    };
    const settle=()=>paint(clock?.currentTime||0);const stop=clock?watchStudioProgrammeFrames(clock,paint):()=>{};
    for(const el of [image,video,clock])for(const event of ['load','loadeddata','seeked'])el?.addEventListener(event,settle);
    const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{measure();settle()}):null;resize?.observe(node);resize?.observe(stage);settle();
    return()=>{stop();resize?.disconnect();for(const el of [image,video,clock])for(const event of ['load','loadeddata','seeked'])el?.removeEventListener(event,settle);for(const raw of [image,video,shared])if(raw)raw.style.visibility='';};
  },[layer,videoRef?.current]);
  if(!hasStudioNodeSurface(layer))return null;
  return <canvas ref={canvasRef} data-studio-node-effect-surface="true" aria-label="Processed node media" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',display:'none'}} />;
}
