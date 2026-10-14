// Property metadata for the existing canonical transform/keyframe graph.
import { GROUP_BOUNDS, GROUP_KIND } from './studioGroups';
export const STUDIO_MOTION_PROPERTIES = [
  { id: "x", label: "X", min: 0, max: 100, step: 0.1 },
  { id: "y", label: "Y", min: 0, max: 100, step: 0.1 },
  { id: "scale", label: "Scale", min: 0.1, max: 5, step: 0.01 },
  { id: "rotation", label: "Rotate", min: -360, max: 360, step: 1 },
  { id: "opacity", label: "Opacity", min: 0, max: 1, step: 0.01 },
  { id: "cropX", label: "Crop X", min: 0, max: 49, step: 0.1, mediaOnly: true },
  { id: "cropY", label: "Crop Y", min: 0, max: 49, step: 0.1, mediaOnly: true },
];

export const studioMotionPropertiesForTarget = target => target?.kind === GROUP_KIND
  ? STUDIO_MOTION_PROPERTIES.filter(property => Object.hasOwn(GROUP_BOUNDS, property.id))
    .map(property => ({ ...property, min: GROUP_BOUNDS[property.id][0], max: GROUP_BOUNDS[property.id][1] }))
  : STUDIO_MOTION_PROPERTIES.filter(property => !property.mediaOnly || target?.id === 'main-video' || ['image', 'video'].includes(target?.type));

// Authoring time is the edit clock; one output frame spans playbackRate / fps.
// Half a frame distinguishes adjacent keys, including 50/60fps delivery.
export const motionKeyframeTolerance = (frameRate = 30, playbackRate = 1) =>
  Math.max(0.000001, (Math.max(0.01, Number(playbackRate) || 1) / Math.max(1, Number(frameRate) || 30)) / 2);

export const motionKeyAtPlayhead = (keys, targetId, property, time, tolerance) =>
  (keys || []).filter(key => key.targetId === targetId && key.property === property &&
    Math.abs(Number(key.time) - Number(time)) <= tolerance)
    .sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time))[0];
