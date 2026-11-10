import {studioMatteSurfaceStyle} from './studioMatteSurface';
import { studioSharedOverlayFrame, studioOverlayDecodeKey, studioSecondaryOverlayFrame } from './studioSharedOverlayFrame';
import React, { useLayoutEffect, useRef } from 'react';
import { watchStudioProgrammeFrames, studioPresentedSourceTime } from './studioSourcePreview';
import { buildMotionAutomationStyle } from './studioAutomation';
import { titleAnimationPose } from './studioTitleLayout';
import { perspectiveCssMatrix } from './studioPerspective';
import { evaluateStudioGroupTransform } from './studioGroups';
import { layoutStudioAnimatedText, studioTextAnimatorPoses } from './studioTextAnimator';
import { studioVectorUri } from './studioVectorShape';
import { hasSoftStudioMask, studioLayerMaskSvg } from './studioMaskGeometry';
import { buildTrackMatteStageSvgDataUri, evaluateWorldLayerPose } from './studioCompRigging';
import { studioVideoMatteUri, studioVideoMatteAlpha } from './studioVideoMatte';

const style = (node, field, value) => { if (node.style[field] !== value) node.style[field] = value; };
const variable = (node, name, value) => { if (node.style.getPropertyValue(name) !== value) node.style.setProperty(name, value); };

// Paint the existing native layer nodes on the programme's decoded clock.
// Editing, history and persistence remain in the ordinary React document. No
// React editor/subtree render, media seek or second animation engine per frame.
export default function StudioProgrammeFrame({ clockRef, mapTime, time, enabled = true,
  layers = [], keyframes = [], groups = [], mainTransform = null, programmeWidth = 720, getDuration,
  getClipPath, getSourceFrame, soloPreviewOverlayId, children }) {
  const loadingMarker = useRef(null);
  const marker = useRef(null), binding = useRef(null), latest = useRef(null);
  const overlayBindings=useRef(new Map());
  const imageBindings=useRef(new Map());
  const layerKeys = new Map();
  for (const key of keyframes) {
    if (!layerKeys.has(String(key.targetId))) layerKeys.set(String(key.targetId), []);
    layerKeys.get(String(key.targetId)).push(key);
  }
  latest.current = { mapTime, allLayers: layers, mainTransform, layers: new Map(layers.map(layer => [String(layer.id), layer])),
    layerKeys, groups, keyframes, programmeWidth, getDuration, getClipPath, getSourceFrame, soloPreviewOverlayId, layouts: new Map() };

  const paint = sourceTime => {
    const stage = marker.current?.parentElement, current = latest.current;
    const sourceFrame=current.getSourceFrame?.(sourceTime);
    const programmeTime = current.mapTime(sourceFrame?.sourceTime ?? sourceTime);
    if (!stage || !Number.isFinite(programmeTime)) return;
    const samePose=current.lastPoseTime===programmeTime;
    const nodes=current.nodes ||= [...stage.querySelectorAll('[data-studio-layer-id]')];
    let pendingLayers = 0;
    const owners=new Map();
    for(const node of nodes){
      const layer=current.layers.get(node.dataset.studioLayerId);
      if(!layer)continue;
      const start=Number(layer.startTime??layer.start_time),duration=Number(current.getDuration?.(layer)??layer.duration);
      const active=layer.isNullRig||!Number.isFinite(start)||!Number.isFinite(duration)||(programmeTime>=start&&programmeTime<start+duration);
      const video=node.querySelector('[data-studio-overlay-decoder]'),key=studioOverlayDecodeKey(layer);
      if(active&&key&&video&&!owners.has(key))owners.set(key,{layer,video});
    }
    for (const node of nodes) {
      const layer = current.layers.get(node.dataset.studioLayerId);
      if (!layer) continue;
      const start = Number(layer.startTime ?? layer.start_time);
      const duration = Number(current.getDuration?.(layer) ?? layer.duration);
      const active = layer.isNullRig || !Number.isFinite(start) || !Number.isFinite(duration) ||
        (programmeTime >= start && programmeTime < start + duration);
      style(node, 'visibility', active && !node.hasAttribute('data-studio-matte-source-only') ? 'visible' : 'hidden');
      node.dataset.programmeTime = String(programmeTime);
      const video=node.querySelector('[data-studio-overlay-decoder]'),shared=node.querySelector('[data-studio-shared-video]');
      if(video&&shared){
        const primary=active?studioSharedOverlayFrame(layer,sourceFrame,programmeTime,current.soloPreviewOverlayId):null;
        const owner=owners.get(studioOverlayDecodeKey(layer));
        const secondary=active&&!primary&&owner?studioSecondaryOverlayFrame(layer,owner.layer,owner.video,programmeTime,current.soloPreviewOverlayId,studioPresentedSourceTime(owner.video)):null;
        const picture=primary||secondary?.picture;
        video.dataset.sharedProgrammeFrame=picture?'true':'false';
        video.dataset.sharedFrameOwner=primary?'programme':secondary?String(secondary.ownerId):'';
        style(video,'display',picture?'none':'');style(shared,'display',picture?'block':'none');
        if(picture){
          video.pause();
          const width=picture.videoWidth||picture.naturalWidth||picture.width,height=picture.videoHeight||picture.naturalHeight||picture.height;
          const region=layer.perspective?.sourceRect,sourceTime=primary?sourceFrame.sourceTime:secondary.sourceTime;
          const rw=region?(region[2]-region[0])/100:1,rh=region?(region[3]-region[1])/100:1;
          const targetWidth=Math.max(1,Math.round(width*rw)),targetHeight=Math.max(1,Math.round(height*rh));
          style(shared,'position',region?'absolute':'');style(shared,'left',region?`${region[0]}%`:'');style(shared,'top',region?`${region[1]}%`:'');
          style(shared,'width',region?`${rw*100}%`:'100%');style(shared,'height',region?`${rh*100}%`:'100%');
          const samples=current.sharedSamples ||= new WeakMap(),previous=samples.get(shared),crop=JSON.stringify(region||null);
          if(width&&height&&(!previous||previous.picture!==picture||previous.time!==sourceTime||previous.crop!==crop||shared.width!==targetWidth||shared.height!==targetHeight)){
            if(shared.width!==targetWidth)shared.width=targetWidth;if(shared.height!==targetHeight)shared.height=targetHeight;
            const ctx=shared.getContext('2d');
            if(region)ctx?.drawImage(picture,width*region[0]/100,height*region[1]/100,width*rw,height*rh,0,0,targetWidth,targetHeight);
            else ctx?.drawImage(picture,0,0,width,height);
            shared.dataset.sourceTime=String(sourceTime);samples.set(shared,{picture,time:sourceTime,crop});
          }
        }
      }
      if (active && video && video.dataset.sharedProgrammeFrame !== 'true' && (video.readyState < 2 || video.seeking)) pendingLayers++;
      if (!active||samePose) continue;
      const pose = (layer.parentId || layer.motionDrivers)
        ? evaluateWorldLayerPose(layer, current.allLayers, current.keyframes, programmeTime, current.mainTransform)
        : buildMotionAutomationStyle(current.layerKeys.get(String(layer.id)), programmeTime, layer);
      const fullscreen = layer.bRollMode === 'fullscreen';
      const title = layer.type === 'text' && !fullscreen;
      const entrance = title ? titleAnimationPose(layer, programmeTime) : { x: 0, y: 0, scale: 1, opacity: 1 };
      style(node, 'left', fullscreen ? '0%' : `${pose.x + entrance.x}%`);
      style(node, 'top', fullscreen ? '0%' : `${pose.y + entrance.y}%`);
      style(node, 'opacity', String(pose.opacity * entrance.opacity));
      variable(node, '--title-scale', String(pose.scale * entrance.scale));
      variable(node, '--title-rotation', `${pose.rotation}deg`);
      if (layer.type === 'image') variable(node, '--layer-opacity', String(pose.opacity * entrance.opacity));
      const resolvedMask=pose.mask||layer.mask;
      if (current.getClipPath) style(node, 'clipPath', current.getClipPath({ ...layer,mask:resolvedMask, cropX: pose.cropX, cropY: pose.cropY }) || '');
      if (hasSoftStudioMask(resolvedMask) && node.clientWidth && node.clientHeight) {
        const svg = studioLayerMaskSvg(resolvedMask, pose.cropX, pose.cropY, node.clientWidth, node.clientHeight,
          title ? 1 : (stage.clientHeight || 720) / 720);
        const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        node.style.maskImage = mask; node.style.webkitMaskImage = mask;
      }
      const plane = node.querySelector('[data-testid="studio-perspective-surface"]');
      if (plane && layer.perspective) style(plane, 'transform', perspectiveCssMatrix(pose.perspective || layer.perspective,
        pose.perspectiveProgress, Math.max(1, Number(plane.dataset.planeWidth)), Math.max(1, Number(plane.dataset.planeHeight))));
      if (layer.vectorShape) {
        const picture = node.querySelector('img'), uri = studioVectorUri(layer.vectorShape, pose);
        if (picture && picture.getAttribute('src') !== uri) picture.setAttribute('src', uri);
      }
      if (title && layer.textAnimator) {
        if (!current.layouts.has(layer.id)) current.layouts.set(layer.id, layoutStudioAnimatedText(layer, current.programmeWidth));
        const layout = current.layouts.get(layer.id), poses = studioTextAnimatorPoses(layer.textAnimator, pose.textProgress, layout);
        for (const unit of node.querySelectorAll('[data-text-unit]')) {
          const index = Number(unit.dataset.textUnit), box = layout.units[index], p = poses[index];
          if (!box || !p) continue;
          const x = box.x + box.width / 2, y = box.y + 25.2;
          unit.setAttribute('opacity', p.opacity);
          unit.setAttribute('transform', `translate(${x + p.x} ${y + p.y}) rotate(${p.rotation}) scale(${p.scale}) translate(${-x} ${-y})`);
        }
      }
      node.dataset.programmeTime = String(programmeTime);
    }
    const stageAspect = stage.clientWidth && stage.clientHeight
      ? stage.clientWidth / stage.clientHeight
      : (current.programmeWidth || 405) / 720;
    for (const wrap of stage.querySelectorAll('[data-studio-matte-wrap]')) {
      const fillLayer = current.layers.get(wrap.dataset.studioMatteWrap);
      const matteLayer = fillLayer?.trackMatte?.sourceLayerId ? current.layers.get(String(fillLayer.trackMatte.sourceLayerId)) : null;
      if (matteLayer && fillLayer?.trackMatte?.mode && fillLayer.trackMatte.mode !== 'none') {
        if (matteLayer.type === 'video' || (matteLayer.type === 'image' && !matteLayer.mask?.enabled && !matteLayer.vectorShape)) {
          const sourceNode = nodes.find(node => node.dataset.studioLayerId === String(matteLayer.id));
          const video = sourceNode?.querySelector('[data-studio-overlay-decoder]');
          // The colour leaf and its matte must read the same validated pixels.
          // A shared leaf's own decoder is paused/hidden and may hold an older
          // decoded picture even after its requested currentTime has settled.
          const shared = sourceNode?.querySelector('[data-studio-shared-video]');
          const bitmap = matteLayer.type==='image'?sourceNode?.querySelector('img'):null;
          const picture = bitmap?.complete&&bitmap.naturalWidth>0?bitmap:video?.dataset.sharedProgrammeFrame === 'true' &&
            shared?.dataset.sourceTime !== undefined ? shared : undefined;
          if(bitmap&&(!bitmap.complete||!bitmap.naturalWidth)&&programmeTime>=Number(matteLayer.startTime||0)&&programmeTime<Number(matteLayer.startTime||0)+Number(matteLayer.duration||0))pendingLayers++;
          const pose = evaluateWorldLayerPose(matteLayer, current.allLayers, current.keyframes, programmeTime, current.mainTransform);
          const canvas = wrap.__studioVideoMatteCanvas ||= document.createElement('canvas');
          const painted = studioVideoMatteUri({ video, picture, layer: matteLayer, pose, time: programmeTime, aspect: stageAspect, canvas });
          if (painted) {
            const uri = studioVideoMatteAlpha(painted, fillLayer.trackMatte.mode);
            if (uri) { wrap.style.maskImage = uri; wrap.style.webkitMaskImage = uri; wrap.dataset.videoMatteTime = bitmap?'static':picture ? shared.dataset.sourceTime : String(studioPresentedSourceTime(video)); }
          }
          continue;
        }
        if (samePose) continue;
        const uri = buildTrackMatteStageSvgDataUri({ matteLayer, overlays: current.allLayers, motionKeyframes: current.keyframes, mainTransform: current.mainTransform, mode: fillLayer.trackMatte.mode, time: programmeTime, stageAspect });
        wrap.style.maskImage = uri; wrap.style.webkitMaskImage = uri;
      }
    }
    for(const surface of stage.querySelectorAll('[data-studio-surface-wrap]')){const layer=current.layers.get(surface.dataset.studioSurfaceWrap);const css=studioMatteSurfaceStyle(layer?.matteSurface,stage.clientHeight||720);for(const [key,value]of Object.entries(css))style(surface,key==='WebkitBoxReflect'?'webkitBoxReflect':key,value);}
    stage.dataset.layerPendingCount = String(pendingLayers);
    if (loadingMarker.current) loadingMarker.current.hidden = pendingLayers === 0;
    if(samePose)return;
    current.lastPoseTime=programmeTime;
    for (const node of stage.querySelectorAll('[data-studio-group-id]')) {
      const group = current.groups.find(item => item.id === node.dataset.studioGroupId);
      if (!group) continue;
      const pose = evaluateStudioGroupTransform(group, current.keyframes, programmeTime);
      node.style.transform = `translate(${pose.x}%, ${pose.y}%) rotate(${pose.rotation}deg) scale(${pose.scale})`;
      node.style.opacity = String(pose.opacity);
      node.style.display = group.timing && (programmeTime < group.timing.startTime ||
        programmeTime >= group.timing.startTime + group.timing.duration) ? 'none' : '';
      node.dataset.studioGroupPose = JSON.stringify(pose);
      node.dataset.programmeTime = String(programmeTime);
    }
  };
  const paintRef = useRef(paint); paintRef.current = paint;
  useLayoutEffect(() => {
    const video = enabled ? clockRef?.current : null;
    if (binding.current?.video !== video) {
      binding.current?.dispose(); binding.current = null;
      if (video) {
        let stop;
        const update = sourceTime => paintRef.current(sourceTime);
        const start = () => { if (!stop) stop = watchStudioProgrammeFrames(video, update); };
        const settle = () => {
          stop?.(); stop = null;
          if (!video.seeking && video.readyState >= 2) update(video.currentTime);
          if (!video.paused && !video.ended) start();
        };
        video.addEventListener('play', start);
        for (const event of ['pause', 'ended', 'seeked', 'loadeddata']) video.addEventListener(event, settle);
        binding.current = { video, dispose() {
          stop?.(); video.removeEventListener('play', start);
          for (const event of ['pause', 'ended', 'seeked', 'loadeddata']) video.removeEventListener(event, settle);
        } };
        settle();
      }
    }
    // React may commit a slower timeupdate or an authored edit. Restore the
    // latest presented pose before that commit becomes visible.
    if (video && !video.seeking && video.readyState >= 2) paintRef.current(studioPresentedSourceTime(video));
  });
  useLayoutEffect(()=>{
    const stage=marker.current?.parentElement,wanted=new Set();
    const update=()=>{const main=clockRef?.current;if(main&&!main.seeking&&main.readyState>=2)paintRef.current(studioPresentedSourceTime(main));};
    if(enabled)for(const node of stage?.querySelectorAll('[data-studio-layer-id]')||[]){
      const video=node.querySelector('[data-studio-overlay-decoder]');
      // Every independent decoder can settle after the programme seek. Source
      // identity permits pixel reuse; it must never determine readiness updates.
      if(!video)continue;wanted.add(video);
      if(!overlayBindings.current.has(video)){
        let stop,pausedFrame;
        const cancelPaused=()=>{if(pausedFrame!==undefined){video.cancelVideoFrameCallback?.(pausedFrame);pausedFrame=undefined;}};
        const start=()=>{cancelPaused();if(!stop)stop=watchStudioProgrammeFrames(video,update);};
        const settle=()=>{
          stop?.();stop=null;cancelPaused();update();
          if(!video.paused&&!video.ended)start();
          else if(!video.seeking&&video.readyState>=2&&video.requestVideoFrameCallback){
            // seeked/currentTime can settle before the paused picture reaches
            // the presenter. Copy that newly presented frame even when its
            // requested timestamp and decoder object have not changed.
            pausedFrame=video.requestVideoFrameCallback(()=>{
              pausedFrame=undefined;latest.current.sharedSamples=new WeakMap();update();
            });
          }
        };
        video.addEventListener('play',start);for(const event of ['loadeddata','seeked','pause','ended'])video.addEventListener(event,settle);
        if(!video.paused&&!video.ended)start();
        overlayBindings.current.set(video,()=>{stop?.();cancelPaused();video.removeEventListener('play',start);for(const event of ['loadeddata','seeked','pause','ended'])video.removeEventListener(event,settle);});
      }
    }
    for(const [video,stop]of overlayBindings.current)if(!wanted.has(video)){stop();overlayBindings.current.delete(video);}
    const pictures=new Set();
    if(enabled)for(const node of stage?.querySelectorAll('[data-studio-matte-source-only]')||[]){
      const picture=node.querySelector('img');if(!picture)continue;pictures.add(picture);
      if(!imageBindings.current.has(picture)){picture.addEventListener('load',update);imageBindings.current.set(picture,()=>picture.removeEventListener('load',update));if(picture.complete)update();}
    }
    for(const [picture,stop]of imageBindings.current)if(!pictures.has(picture)){stop();imageBindings.current.delete(picture);}
  });
  useLayoutEffect(() => {
    const stage = marker.current?.parentElement;
    return () => {
      binding.current?.dispose();
      for(const stop of overlayBindings.current.values())stop();overlayBindings.current.clear();
      for(const stop of imageBindings.current.values())stop();imageBindings.current.clear();
      // Release before the live subtree is removed. Detached media can keep
      // decoding/playing, including overlay audio, while the final file plays.
      for (const video of stage?.querySelectorAll('[data-studio-overlay-decoder]') || []) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
    };
  }, []);
  return <><span ref={marker} hidden aria-hidden="true" /><span ref={loadingMarker} hidden className="studio-layer-loading" data-testid="studio-layer-loading" role="status" aria-live="polite">Preparing preview layers…</span>{children(time)}</>;
}
