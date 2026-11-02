import React, { useLayoutEffect, useRef, useState } from 'react';
import { perspectiveCssMatrix } from './studioPerspective';
import { buildMotionAutomationStyle } from './studioAutomation';
import { watchStudioProgrammeFrames, studioPresentedSourceTime } from './studioSourcePreview';

export default function StudioPerspectiveSurface({ value, progress, children, clockRef, mapTime, layer, keyframes }) {
  const ref = useRef(null), [size, setSize] = useState([1, 1]);
  const enabled = !!value;
  const latest = useRef(null), binding = useRef(null);
  latest.current = { value, mapTime, layer, keyframes };
  useLayoutEffect(() => {
    const video = enabled ? clockRef?.current : null;
    const paint = sourceTime => {
      const el = ref.current, current = latest.current;
      if (!el || !current.layer || !current.mapTime) return;
      const time = current.mapTime(sourceTime), pose = buildMotionAutomationStyle(current.keyframes, time, current.layer);
      const parent = el.parentElement;
      parent.style.visibility = time >= Number(current.layer.startTime || 0) &&
        time < Number(current.layer.startTime || 0) + Number(current.layer.duration || 0) ? 'visible' : 'hidden';
      parent.style.left = `${pose.x}%`; parent.style.top = `${pose.y}%`; parent.style.opacity = String(pose.opacity);
      parent.style.setProperty('--title-scale', String(pose.scale)); parent.style.setProperty('--title-rotation', `${pose.rotation}deg`);
      el.style.transform = perspectiveCssMatrix(pose.perspective || current.value, pose.perspectiveProgress,
        Math.max(1, el.clientWidth), Math.max(1, el.clientHeight));
      el.dataset.programmeTime = String(time);
    };
    if (binding.current?.video !== video) {
      binding.current?.dispose(); binding.current = null;
      if (video) {
        let stop;
        const update = time => binding.current?.paint(time);
        const start = () => { if (!stop) stop = watchStudioProgrammeFrames(video, update); };
        const settle = () => { stop?.(); stop = null; update(video.currentTime); if (!video.paused && !video.ended) start(); };
        video.addEventListener('play', start);
        for (const event of ['pause', 'seeked', 'loadeddata']) video.addEventListener(event, settle);
        binding.current = { video, paint, dispose() {
          stop?.(); video.removeEventListener('play', start);
          for (const event of ['pause', 'seeked', 'loadeddata']) video.removeEventListener(event, settle);
        } };
        start();
      }
    }
    if (binding.current) { binding.current.paint = paint; paint(studioPresentedSourceTime(video)); }
  });
  useLayoutEffect(() => () => binding.current?.dispose(), []);
  useLayoutEffect(() => {
    const update = () => { const el=ref.current; if (el) setSize([Math.max(1,el.clientWidth),Math.max(1,el.clientHeight)]); };
    if (!enabled) return undefined;
    update(); const observer=typeof ResizeObserver==='function'?new ResizeObserver(update):null; if (ref.current) observer?.observe(ref.current);
    return () => observer?.disconnect();
  }, [enabled]);
  if (!value) return children;
  const region=value.sourceRect||[0,0,100,100],rw=region[2]-region[0],rh=region[3]-region[1];
  const cropped=!!value.sourceRect;
  return <div ref={ref} data-testid="studio-perspective-surface" data-plane-width={size[0]} data-plane-height={size[1]} style={{width:'100%',height:'100%',
    transformOrigin:'0 0',transform:perspectiveCssMatrix(value,progress,...size)}}>
    {cropped?<div style={{width:'100%',height:'100%',overflow:'hidden',position:'relative'}}>
      <div data-testid="studio-plane-source-region" style={{position:'absolute',width:`${10000/rw}%`,height:`${10000/rh}%`,
        left:`${-region[0]*100/rw}%`,top:`${-region[1]*100/rh}%`}}>{children}</div>
    </div>:children}</div>;
}
