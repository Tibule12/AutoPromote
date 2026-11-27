import React, { useLayoutEffect, useRef } from 'react';
import { applyEdgeLightWrapAndLinear, applyMeshGridWarp, applyScreenGlareReflection, hasStudioNodeSurface, paintStudioNodeSurface, studioNodeFilteredSurface } from './studioNodeEffects';
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
      const layerKeys=(state.keyframes||[]).filter(key=>String(key.targetId)===String(state.layer.id));
      const animatedPixels=state.layer.displacementWarp?.enabled||state.layer.motionBlur?.enabled||state.layer.lightWrap?.enabled||state.layer.screenReplace?.enabled||state.layer.meshWarp?.enabled||layerKeys.some(key=>
        /^(planeCorner|perspectiveProgress|maskPoint|strokeStart|strokeEnd|strokeOffset|keySimilarity|keySmoothness|keySpill|keyChoke)/.test(key.property));
      const density=clock?.paused||(image&&!animatedPixels)?Math.max(1,Number(state.programmeHeight)/displayHeight):1;
      const w=Math.max(2,Math.round(width*density)),h=Math.max(2,Math.round(height*density));
      const programmeHeight=displayHeight*density;
      const at=state.mapTime?state.mapTime(sourceTime):state.time;
      const needPose=Boolean(state.layer.perspective||state.layer.motionBlur?.enabled||layerKeys.length);
      const pose=needPose?evaluateWorldLayerPose(state.layer,state.overlays,state.keyframes,at,state.mainTransform):null;
      const staticKey=image&&!state.layer.displacementWarp?.enabled&&!state.layer.lightWrap?.enabled&&!state.layer.screenReplace?.enabled&&!state.layer.meshWarp?.enabled&&!(state.layer.motionBlur?.enabled&&layerKeys.length)
        ? JSON.stringify([image.currentSrc||image.src,image.naturalWidth,image.naturalHeight,state.layer,w,h,programmeHeight,pose?.perspective,pose?.perspectiveProgress,pose?.keySimilarity,pose?.keySmoothness,pose?.keySpill,pose?.keyChoke]) : null;
      const reused=staticKey&&paintedRef.current?.canvas===canvas&&paintedRef.current.key===staticKey;
      let padding=reused?paintedRef.current.padding:0;
      try {if(!reused){
        if(local.width!==w)local.width=w;if(local.height!==h)local.height=h;
        const doMotionBlur=Boolean(state.layer.motionBlur?.enabled&&layerKeys.length);
        const mbSamples=doMotionBlur?Math.max(2,Math.min(5,Math.round(Number(state.layer.motionBlur?.samples||3)))):1;
        const mbShutter=Math.max(0.05,Math.min(1,Number(state.layer.motionBlur?.shutter??0.5)))/30;
        if(mbSamples===1){
          if(!paintStudioNodeSurface(local,source,state.layer,at,programmeHeight,pose))return;
        }else{
          const accum=new Float32Array(w*h*4);
          const lCtx=local.getContext('2d',{willReadFrequently:true});
          for(let s=0;s<mbSamples;s++){
            const sampleAt=Math.max(0,at-(mbSamples-1-s)*mbShutter);
            const samplePose=evaluateWorldLayerPose(state.layer,state.overlays,state.keyframes,sampleAt,state.mainTransform);
            if(!paintStudioNodeSurface(local,source,state.layer,sampleAt,programmeHeight,samplePose))return;
            if(state.layer.perspective)projectStudioCanvas(local,samplePose?.perspective||state.layer.perspective,samplePose?.perspectiveProgress??100);
            const d=lCtx.getImageData(0,0,w,h).data;
            const wt=1/mbSamples;
            for(let p=0;p<w*h;p++){const i=p*4,a=(d[i+3]/255)*wt;accum[i]+=d[i]*a;accum[i+1]+=d[i+1]*a;accum[i+2]+=d[i+2]*a;accum[i+3]+=d[i+3]*wt;}
          }
          const imgOut=lCtx.createImageData(w,h);
          for(let p=0;p<w*h;p++){const i=p*4,a=accum[i+3],sa=a/255;imgOut.data[i]=sa>0.001?Math.min(255,Math.round(accum[i]/sa)):0;imgOut.data[i+1]=sa>0.001?Math.min(255,Math.round(accum[i+1]/sa)):0;imgOut.data[i+2]=sa>0.001?Math.min(255,Math.round(accum[i+2]/sa)):0;imgOut.data[i+3]=Math.min(255,Math.round(a));}
          lCtx.putImageData(imgOut,0,0);
        }
        if((state.layer.frameShape||'round')!=='edge'&&state.layer.bRollMode!=='fullscreen'){
          const ctx=local.getContext('2d'),radius=Math.max(12,Math.min(48,Number(state.layer.borderRadius??28)))/400;
          ctx.globalCompositeOperation='destination-in';ctx.fillStyle='white';ctx.beginPath();ctx.roundRect(0,0,w,h,[{x:w*radius,y:h*radius}]);ctx.fill();ctx.globalCompositeOperation='source-over';
        }
        if(state.layer.meshWarp?.enabled){
          const mCtx=local.getContext('2d',{willReadFrequently:true});
          const mImg=mCtx.getImageData(0,0,w,h);
          applyMeshGridWarp(mImg.data,w,h,state.layer.meshWarp,at,programmeHeight/720);
          mCtx.putImageData(mImg,0,0);
        }
        if(state.layer.perspective&&mbSamples===1)projectStudioCanvas(local,pose?.perspective||state.layer.perspective,pose?.perspectiveProgress??100);
        if(state.layer.lightWrap?.enabled||state.layer.screenReplace?.enabled){
          const bgEl=stage?.querySelector?.('[data-testid="studio-programme-canvas"], canvas, video');
          if(bgEl){
            const bgCanvas=document.createElement('canvas');bgCanvas.width=w;bgCanvas.height=h;
            const bgCtx=bgCanvas.getContext('2d',{willReadFrequently:true});
            const sRect=stage.getBoundingClientRect(),nRect=node.getBoundingClientRect();
            const bgW=bgEl.width||bgEl.videoWidth||0,bgH=bgEl.height||bgEl.videoHeight||0;
            if(sRect.width>0&&sRect.height>0&&bgW>0&&bgH>0){
              const sx=((nRect.left-sRect.left)/sRect.width)*bgW,sy=((nRect.top-sRect.top)/sRect.height)*bgH;
              const sw=(nRect.width/sRect.width)*bgW,sh=(nRect.height/sRect.height)*bgH;
              try{
                bgCtx.drawImage(bgEl,Math.max(0,sx),Math.max(0,sy),Math.max(1,sw),Math.max(1,sh),0,0,w,h);
                const lCtx=local.getContext('2d',{willReadFrequently:true});
                const fgImg=lCtx.getImageData(0,0,w,h),bgImg=bgCtx.getImageData(0,0,w,h);
                if(state.layer.lightWrap?.enabled||state.layer.linearLight){
                  applyEdgeLightWrapAndLinear(fgImg.data,bgImg.data,w,h,{...(state.layer.lightWrap||{intensity:0}),linearLight:!!state.layer.linearLight,units:programmeHeight/720});
                }
                if(state.layer.screenReplace?.enabled){
                  applyScreenGlareReflection(fgImg.data,bgImg.data,w,h,state.layer.screenReplace.glarePreserve??0.35);
                }
                lCtx.putImageData(fgImg,0,0);
              }catch(_e){}
            }
          }
        }
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
