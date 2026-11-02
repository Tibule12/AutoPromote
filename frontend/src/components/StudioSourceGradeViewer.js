import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { watchStudioProgrammeFrames } from './studioSourcePreview';
import { buildPrecisionGrade, applyPrecisionGrade } from './studioPrecisionGrade';
import { applyColorCube, buildAdvancedColorCube } from './studioColorCube';
import { compileStudioAdjustmentStack } from './studioAdjustmentGrade';
import { buildCinematicCssFilter, DEFAULT_CINEMATIC_FX } from '../hooks/useCinematicEffects';

// Source-picture inspection uses the same colour operations and source clock
// as the programme monitor. It deliberately excludes graphics/branch merges.
export default function StudioSourceGradeViewer({ nodeId, videoRef, mapTime, time,
  finishFx, advancedColor, adjustmentLayers }) {
  const canvas = useRef(null), latest = useRef(null);
  const cube = useMemo(() => buildAdvancedColorCube(advancedColor || {}), [advancedColor]);
  const stack = useMemo(() => compileStudioAdjustmentStack(adjustmentLayers), [adjustmentLayers]);
  latest.current = { nodeId, mapTime, time, finishFx, cube, stack };
  useLayoutEffect(() => {
    const video = videoRef?.current, out = canvas.current;
    if (!video || !out) return undefined;
    const paint = sourceTime => {
      if (video.readyState < 2 || video.seeking || !video.videoWidth) return;
      const state = latest.current, ctx = out.getContext('2d', { willReadFrequently: true });
      out.width = 320; out.height = Math.max(2, Math.round(320 * video.videoHeight / video.videoWidth));
      ctx.drawImage(video, 0, 0, out.width, out.height);
      const raw = state.nodeId === 'MediaIn:main-video';
      if (!raw) {
        const fx = { ...DEFAULT_CINEMATIC_FX, ...state.finishFx };
        if (fx.precisionGrade) {
          const pixels = ctx.getImageData(0, 0, out.width, out.height);
          applyPrecisionGrade(pixels.data, buildPrecisionGrade(fx)); ctx.putImageData(pixels, 0, 0);
        } else {
          const copy = document.createElement('canvas'); copy.width = out.width; copy.height = out.height;
          copy.getContext('2d').drawImage(out, 0, 0); ctx.filter = buildCinematicCssFilter(fx) || 'none';
          ctx.drawImage(copy, 0, 0); ctx.filter = 'none';
        }
        const cube = state.cube;
        if (cube) { const pixels = ctx.getImageData(0, 0, out.width, out.height); applyColorCube(pixels.data, cube); ctx.putImageData(pixels, 0, 0); }
        if (state.nodeId.startsWith('Adjustment:')) {
          const at = state.mapTime ? state.mapTime(sourceTime) : state.time;
          for (const layer of state.stack) {
            if (at >= layer.startTime && at < layer.startTime + layer.duration) {
              const pixels = ctx.getImageData(0, 0, out.width, out.height);
              applyPrecisionGrade(pixels.data, buildPrecisionGrade(layer.effects.color));
              if (layer.effects.color_cube) applyColorCube(pixels.data, layer.effects.color_cube);
              ctx.putImageData(pixels, 0, 0);
              const glow = layer.effects.glow;
              if (glow.intensity > 0 && glow.radius > 0) {
                const copy = document.createElement('canvas'); copy.width = out.width; copy.height = out.height;
                const soft = copy.getContext('2d'); soft.filter = `blur(${glow.radius * out.height / 720}px)`;
                soft.drawImage(out, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = glow.intensity;
                ctx.drawImage(copy, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
              }
            }
            if (`Adjustment:${layer.id}` === state.nodeId) break;
          }
        }
      }
      out.dataset.sourceTime = String(sourceTime);
    };
    paint(video.currentTime);
    const stop = watchStudioProgrammeFrames(video, paint);
    const settle = () => paint(video.currentTime);
    video.addEventListener('seeked', settle); video.addEventListener('loadeddata', settle);
    return () => { stop(); video.removeEventListener('seeked', settle); video.removeEventListener('loadeddata', settle); };
  }, [videoRef?.current, nodeId, time, finishFx, advancedColor, adjustmentLayers]);
  return <canvas ref={canvas} aria-label="Source grade picture" style={{ width: '100%', display: 'block' }} />;
}
