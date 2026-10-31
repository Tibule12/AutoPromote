import React, { useLayoutEffect, useRef } from 'react';
import { watchStudioProgrammeFrames, studioPresentedSourceTime } from './studioSourcePreview';
import { buildMotionAutomationStyle } from './studioAutomation';
import { titleAnimationPose } from './studioTitleLayout';
import { perspectiveCssMatrix } from './studioPerspective';
import { evaluateStudioGroupTransform } from './studioGroups';
import { layoutStudioAnimatedText, studioTextAnimatorPoses } from './studioTextAnimator';
import { studioVectorUri } from './studioVectorShape';
import { hasSoftStudioMask, studioLayerMaskSvg } from './studioMaskGeometry';

// Paint the existing native layer nodes on the programme's decoded clock.
// Editing, history and persistence remain in the ordinary React document. No
// React editor/subtree render, media seek or second animation engine per frame.
export default function StudioProgrammeFrame({ clockRef, mapTime, time, enabled = true,
  layers = [], keyframes = [], groups = [], programmeWidth = 720, getDuration,
  getClipPath, children }) {
  const marker = useRef(null), binding = useRef(null), latest = useRef(null);
  const layerKeys = new Map();
  for (const key of keyframes) {
    if (!layerKeys.has(String(key.targetId))) layerKeys.set(String(key.targetId), []);
    layerKeys.get(String(key.targetId)).push(key);
  }
  latest.current = { mapTime, layers: new Map(layers.map(layer => [String(layer.id), layer])),
    layerKeys, groups, keyframes, programmeWidth, getDuration, getClipPath, layouts: new Map() };

  const paint = sourceTime => {
    const stage = marker.current?.parentElement, current = latest.current;
    const programmeTime = current.mapTime(sourceTime);
    if (!stage || !Number.isFinite(programmeTime)) return;
    for (const node of stage.querySelectorAll('[data-studio-layer-id]')) {
      const layer = current.layers.get(node.dataset.studioLayerId);
      if (!layer) continue;
      const pose = buildMotionAutomationStyle(current.layerKeys.get(String(layer.id)), programmeTime, layer);
      const fullscreen = layer.bRollMode === 'fullscreen';
      const title = layer.type === 'text' && !fullscreen;
      const entrance = title ? titleAnimationPose(layer, programmeTime) : { x: 0, y: 0, scale: 1, opacity: 1 };
      const start = Number(layer.startTime ?? layer.start_time);
      const duration = Number(current.getDuration?.(layer) ?? layer.duration);
      node.style.visibility = Number.isFinite(start) && Number.isFinite(duration) &&
        (programmeTime < start || programmeTime >= start + duration) ? 'hidden' : 'visible';
      node.style.left = fullscreen ? '0%' : `${pose.x + entrance.x}%`;
      node.style.top = fullscreen ? '0%' : `${pose.y + entrance.y}%`;
      node.style.opacity = String(pose.opacity * entrance.opacity);
      node.style.setProperty('--title-scale', String(pose.scale * entrance.scale));
      node.style.setProperty('--title-rotation', `${pose.rotation}deg`);
      if (layer.type === 'image') node.style.setProperty('--layer-opacity', String(pose.opacity * entrance.opacity));
      if (current.getClipPath) node.style.clipPath = current.getClipPath({ ...layer, cropX: pose.cropX, cropY: pose.cropY }) || '';
      if (hasSoftStudioMask(layer.mask) && node.clientWidth && node.clientHeight) {
        const svg = studioLayerMaskSvg(layer.mask, pose.cropX, pose.cropY, node.clientWidth, node.clientHeight,
          title ? 1 : (stage.clientHeight || 720) / 720);
        const mask = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
        node.style.maskImage = mask; node.style.webkitMaskImage = mask;
      }
      const plane = node.querySelector('[data-testid="studio-perspective-surface"]');
      if (plane && layer.perspective) plane.style.transform = perspectiveCssMatrix(layer.perspective,
        pose.perspectiveProgress, Math.max(1, plane.clientWidth), Math.max(1, plane.clientHeight));
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
  useLayoutEffect(() => () => binding.current?.dispose(), []);
  return <><span ref={marker} hidden aria-hidden="true" />{children(time)}</>;
}
