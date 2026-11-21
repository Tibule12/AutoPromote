import { applySelectiveAdjustment, blendSelectiveGrade, applySelectiveClone, applySelectiveRecolor } from './studioSelectiveMask';
import {blendStudioNodeMask,captureStudioGradeSurface} from './studioNodeMask';
import {paintStudioNodeSurface} from './studioNodeEffects';
import {evaluateWorldLayerPose} from './studioCompRigging';
import {parseStudioMaskPolygon} from './studioMaskGeometry';
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { watchStudioProgrammeFrames } from './studioSourcePreview';
import { buildPrecisionGrade, applyPrecisionGrade, applyPrecisionVignette } from './studioPrecisionGrade';
import { applyColorCube, buildAdvancedColorCube, hasRevitalizerGrade } from './studioColorCube';
import { compileStudioAdjustmentStack } from './studioAdjustmentGrade';
import { applySelectiveAndRevitalizerGrade } from './studioColorScience';
import { buildCinematicCssFilter, DEFAULT_CINEMATIC_FX } from '../hooks/useCinematicEffects';
import { computeColorScopesFromRgba } from './studioColorScopes';

// Source-picture inspection uses the same colour operations and source clock
// as the programme monitor. It deliberately excludes graphics/branch merges.
export default function StudioSourceGradeViewer({ nodeId, videoRef, mapTime, time,
  finishFx, advancedColor, adjustmentLayers, overlays=[], motionKeyframes=[], mainTransform }) {
  const canvas = useRef(null), latest = useRef(null);
  const cube = useMemo(
    () =>
      buildAdvancedColorCube(
        advancedColor?.qualifier?.showMatte
          ? { ...advancedColor, qualifier: null }
          : advancedColor || {}
      ),
    [advancedColor]
  );
  const stack = useMemo(() => compileStudioAdjustmentStack(adjustmentLayers), [adjustmentLayers]);
  latest.current = { nodeId, mapTime, time, finishFx, advancedColor, cube, stack, overlays, motionKeyframes, mainTransform };
  useLayoutEffect(() => {
    const video = videoRef?.current, out = canvas.current;
    if (!video || !out) return undefined;
    const paint = sourceTime => {
      if (video.readyState < 2 || video.seeking || !video.videoWidth) return;
      const state = latest.current, ctx = out.getContext('2d', { willReadFrequently: true });
      const height=Math.max(2,Math.round(320*video.videoHeight/video.videoWidth));
      if(out.width!==320)out.width=320;if(out.height!==height)out.height=height;
      ctx.drawImage(video, 0, 0, out.width, out.height);
      const at = state.mapTime ? state.mapTime(sourceTime) : state.time;
      const blend=(id,original,invert=false)=>blendStudioNodeMask(ctx,original,id,{overlays:state.overlays,keys:state.motionKeyframes,mainTransform:state.mainTransform,time:at,width:out.width,height:out.height,evaluatePose:evaluateWorldLayerPose,paintSurface:paintStudioNodeSurface,parsePolygon:parseStudioMaskPolygon,invert});
      const gradeMask=state.advancedColor?.maskSourceNodeId||state.finishFx?.maskSourceNodeId;
      const original=gradeMask?captureStudioGradeSurface(ctx):null;
      const raw = state.nodeId === 'MediaIn:main-video';
      if (!raw) {
        const fx = { ...DEFAULT_CINEMATIC_FX, ...state.finishFx };
        const adv = state.advancedColor || fx.advancedColor || {};
        if (fx.precisionGrade || fx.dehaze || fx.shadowRecovery || fx.vibrance || fx.qualifier?.enabled || fx.powerWindow?.enabled || adv.powerWindow?.enabled || adv.qualifier?.enabled) {
          const pixels = ctx.getImageData(0, 0, out.width, out.height);
          // When cube already bakes adv.revitalizer / qualifier (non-matte), avoid double-applying them in precision pass.
          const cubeOwnsRevitalizer = hasRevitalizerGrade(adv.revitalizer);
          const cubeOwnsQualifier = Boolean(adv.qualifier?.enabled && !adv.qualifier?.showMatte);
          const precisionFx = {
            ...fx,
            ...(cubeOwnsRevitalizer ? { revitalizer: {}, dehaze: 0, shadowRecovery: 0, highlightRollOff: 0, clarity: 0, vibrance: 0 } : {}),
            ...(cubeOwnsQualifier ? { qualifier: null, advancedColor: { ...(fx.advancedColor || {}), qualifier: null } } : {}),
          };
          applyPrecisionGrade(pixels.data, buildPrecisionGrade(precisionFx), out.width, out.height);
          if (adv.powerWindow?.enabled || adv.qualifier?.showMatte) {
            applySelectiveAndRevitalizerGrade(pixels.data, out.width, out.height, {
              qualifier: adv.qualifier?.showMatte ? adv.qualifier : null,
              powerWindow: adv.powerWindow,
            });
          }
          ctx.putImageData(pixels, 0, 0);
        } else {
          const copy = document.createElement('canvas'); copy.width = out.width; copy.height = out.height;
          copy.getContext('2d').drawImage(out, 0, 0); ctx.filter = buildCinematicCssFilter(fx) || 'none';
          ctx.drawImage(copy, 0, 0); ctx.filter = 'none';
        }
        const cube = state.cube;
        if (cube) { const pixels = ctx.getImageData(0, 0, out.width, out.height); applyColorCube(pixels.data, cube); ctx.putImageData(pixels, 0, 0); }
        if(gradeMask)blend(gradeMask,original,!!state.advancedColor?.maskInvert);
        if (state.nodeId?.startsWith('Adjustment:')) {
          const at = state.mapTime ? state.mapTime(sourceTime) : state.time;
          for (const layer of state.stack) {
            if (at >= layer.startTime && at < layer.startTime + layer.duration) {
              if(layer.mask?.space==='programme'&&!layer.maskSourceNodeId&&applySelectiveAdjustment(ctx,layer,at-layer.startTime)){if(`Adjustment:${layer.id}`===state.nodeId)break;continue;}
              const before=layer.maskSourceNodeId?captureStudioGradeSurface(ctx):null;
              const regionOriginal=layer.mask?.space==='programme'?ctx.getImageData(0,0,out.width,out.height):null;
              if(layer.effects.clone_patch?.enabled)ctx.putImageData(applySelectiveClone(ctx.getImageData(0,0,out.width,out.height),layer.effects.clone_patch,layer.mask,at-layer.startTime),0,0);
              const pixels = ctx.getImageData(0, 0, out.width, out.height);
              applyPrecisionGrade(pixels.data, buildPrecisionGrade(layer.effects.color), out.width, out.height);
              applyPrecisionVignette(pixels.data, out.width, out.height, layer.effects.color.vignette);
              if (layer.effects.color_cube) applyColorCube(pixels.data, layer.effects.color_cube);
              ctx.putImageData(pixels, 0, 0);
              const glow = layer.effects.glow;
              if (glow.intensity > 0 && glow.radius > 0) {
                const copy = document.createElement('canvas'); copy.width = out.width; copy.height = out.height;
                const soft = copy.getContext('2d'); soft.filter = `blur(${glow.radius * out.height / 720}px)`;
                soft.drawImage(out, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = glow.intensity;
                ctx.drawImage(copy, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
              }
              if(layer.effects.recolor?.enabled)ctx.putImageData(applySelectiveRecolor(ctx.getImageData(0,0,out.width,out.height),layer.effects.recolor,layer.mask,at-layer.startTime),0,0);
              if(layer.mask?.space==='programme')blendSelectiveGrade(ctx,regionOriginal,layer.mask,at-layer.startTime);
              if(layer.maskSourceNodeId)blend(layer.maskSourceNodeId,before);
            }
            if (`Adjustment:${layer.id}` === state.nodeId) break;
          }
        }
      }
      try {
        const sample = ctx.getImageData(0, 0, out.width, out.height);
        const scopes = computeColorScopesFromRgba(sample.data, out.width, out.height, { columns: 16, lumaBins: 12, vectorBins: 11 });
        out.dataset.lumaAvg = String(scopes.lumaStats.avgLuma);
        out.dataset.skinCompliance = String(scopes.vectorscope.skinToneCompliancePct);
      } catch (_err) {
        // Ignore cross-origin canvas read errors in synthetic environments
      }
      out.dataset.sourceTime = String(sourceTime);
    };
    paint(video.currentTime);
    const stop = watchStudioProgrammeFrames(video, paint);
    const settle = () => paint(video.currentTime);
    video.addEventListener('seeked', settle); video.addEventListener('loadeddata', settle);
    return () => { stop(); video.removeEventListener('seeked', settle); video.removeEventListener('loadeddata', settle); };
  }, [videoRef?.current, nodeId, time, finishFx, advancedColor, adjustmentLayers, overlays, motionKeyframes, mainTransform]);
  return <canvas ref={canvas} aria-label="Source grade picture" style={{ width: '100%', display: 'block' }} />;
}
