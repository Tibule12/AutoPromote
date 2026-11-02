import React, { useRef } from 'react';
import { interpolateAutomationValue } from './studioAutomation';
import { evaluateLocalLayerPose, evaluateWorldLayerPose } from './studioCompRigging';

// A control for the ordinary canonical Null Rig. Its children and mattes keep
// using the shared world-pose evaluator; this gizmo never renders into a movie.
export default function StudioRigController({ layer, layers, keys, mainTransform, time,
  stageRef, onChange, onInteractionStart, onInteractionEnd }) {
  const gesture = useRef(null);
  const point = event => {
    const r = stageRef.current?.getBoundingClientRect();
    return r?.width && r?.height ? { x: (event.clientX - r.left) / r.width * 100,
      y: (event.clientY - r.top) / r.height * 100 } : null;
  };
  const start = (event, mode) => {
    if (event.button !== 0 || gesture.current) return;
    const cursor = point(event); if (!cursor) return;
    event.preventDefault(); event.stopPropagation();
    const world = evaluateWorldLayerPose(layer, layers, keys, time, mainTransform);
    const local = evaluateLocalLayerPose(layer, keys, time);
    const parent = layer.parentId === 'main-video' ? { id: 'main-video', ...mainTransform }
      : layers.find(item => String(item.id) === String(layer.parentId));
    const parentPose = parent ? evaluateWorldLayerPose(parent, layers, keys, time, mainTransform)
      : { x: 50, y: 50, scale: 1, rotation: 0 };
    const authored = Object.fromEntries(['x', 'y', 'rotation'].map(property => [property,
      interpolateAutomationValue({ keyframes: keys.filter(k => String(k.targetId) === String(layer.id)),
        property, time, fallback: layer[property] ?? (property === 'rotation' ? 0 : 50) })]));
    gesture.current = { pointerId: event.pointerId, mode, cursor, world, local, parentPose, authored,
      angle: Math.atan2(cursor.y - world.y, cursor.x - world.x) };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onInteractionStart?.();
  };
  const move = event => {
    const g = gesture.current, cursor = point(event);
    if (!g || !cursor || g.pointerId !== event.pointerId) return;
    event.stopPropagation();
    let patch;
    if (g.mode === 'rotate') {
      const angle = Math.atan2(cursor.y - g.world.y, cursor.x - g.world.x);
      const delta = Math.atan2(Math.sin(angle - g.angle), Math.cos(angle - g.angle)) * 180 / Math.PI;
      patch = { rotation: Math.max(-3600, Math.min(3600, g.authored.rotation + delta)) };
    } else {
      const dx = (cursor.x - g.cursor.x) / g.parentPose.scale;
      const dy = (cursor.y - g.cursor.y) / g.parentPose.scale;
      const r = -g.parentPose.rotation * Math.PI / 180;
      patch = { x: Math.max(-100, Math.min(200, g.authored.x + dx * Math.cos(r) - dy * Math.sin(r))),
        y: Math.max(-100, Math.min(200, g.authored.y + dx * Math.sin(r) + dy * Math.cos(r))) };
    }
    onChange(Object.fromEntries(Object.entries(patch).map(([p, v]) => [p, Number(v.toFixed(4))])));
  };
  const end = (event, cancel = false) => {
    const g = gesture.current; if (!g || event.pointerId !== g.pointerId) return;
    event.stopPropagation();
    if (cancel) onChange(g.mode === 'rotate' ? { rotation: g.authored.rotation }
      : { x: g.authored.x, y: g.authored.y });
    else move(event);
    gesture.current = null; onInteractionEnd?.();
  };
  const events = { onPointerMove: move, onPointerUp: event => end(event), onPointerCancel: event => end(event, true) };
  return <div className="ap-null-rig-gizmo" data-testid={`null-rig-gizmo-${layer.id}`}
    onMouseDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()}
    {...events} onPointerDown={event => start(event, 'move')}
    style={{ position: 'relative', touchAction: 'none', pointerEvents: 'auto' }}>
    <button type="button" aria-label={`Move ${layer.name || 'Null Rig'}`}
      style={{ cursor: 'move', touchAction: 'none', color: 'inherit', background: 'transparent', border: 0 }}>
      ⊕ NULL
    </button>
    <button type="button" aria-label={`Rotate ${layer.name || 'Null Rig'}`}
      onPointerDown={event => start(event, 'rotate')}
      style={{ position: 'absolute', top: -28, left: '50%', cursor: 'grab', touchAction: 'none', color: '#22d3ee', background: '#0f172a', border: '1px solid #22d3ee', borderRadius: 20 }}>
      ↻
    </button>
  </div>;
}
