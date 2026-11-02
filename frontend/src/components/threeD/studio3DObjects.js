// Independent scene objects remain JSON decisions in the existing 3D contract.
import { normalizeRibbon } from "./studio3DRibbon";
export const STUDIO_3D_SHAPES = ["box", "sphere", "torus", "cylinder", "icosphere", "ribbon", "plane"];
export const STUDIO_3D_OBJECT_MATERIALS = ["inherit", "chrome", "glass", "neon", "gold", "matte", "holographic", "architecture", "brushed", "silk"];
export const OBJECT_POSE_FIELDS = ["x", "y", "z", "scaleX", "scaleY", "scaleZ", "rotationX", "rotationY", "rotationZ"];
const easings = ["linear", "ease_out", "ease_in_out", "spring"];
const clamp = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
export const objectBounds = field => field.startsWith("scale") ? [.05, 4, 1]
  : field.startsWith("rotation") ? [-180, 180, 0] : [-6, 6, 0];
const pose = raw => Object.fromEntries(OBJECT_POSE_FIELDS.map(field => [field, clamp(raw?.[field], ...objectBounds(field))]));
const text = (value, fallback) => String(value || fallback).replace(/[<>\x00-\x1f]/g, " ").slice(0, 80); // eslint-disable-line no-control-regex
export function normalizeStudio3DObjects(raw, duration) {
  return (Array.isArray(raw) ? raw : []).slice(0, 24).map((item, index) => ({
    id: text(item.id, `object-${index + 1}`).replace(/[^A-Za-z0-9_-]/g, "_"),
    name: text(item.name, `Object ${index + 1}`),
    shape: STUDIO_3D_SHAPES.includes(item.shape) ? item.shape : "sphere",
    color: /^#[\da-f]{6}$/i.test(item.color || "") ? item.color : "#8b5cf6",
    ...(item.material && item.material !== "inherit" ? { material: STUDIO_3D_OBJECT_MATERIALS.includes(item.material) ? item.material : "matte" } : {}),
    ...(Number(item.bevel) > 0 ? { bevel: clamp(item.bevel, 0, .15, 0) } : {}),
    ...(item.roughness !== undefined ? { roughness: clamp(item.roughness, .04, 1, .25) } : {}),
    ...(item.shape === "ribbon" ? { ribbon: normalizeRibbon(item.ribbon) } : {}),
    ...pose(item),
    keyframes: (Array.isArray(item.keyframes) ? item.keyframes : []).slice(0, 32).map((key, i) => ({
      id: text(key.id, `object-key-${i}`).replace(/[^A-Za-z0-9_-]/g, "_"),
      time: clamp(key.time, 0, duration, 0),
      easing: easings.includes(key.easing) ? key.easing : "ease_in_out",
      values: pose(key.values),
    })).sort((a, b) => a.time - b.time),
  }));
}
export function createStudio3DObject(shape, id) {
  return normalizeStudio3DObjects([{ id, shape, name: shape[0].toUpperCase() + shape.slice(1) }], 10)[0];
}
export function studio3DObjectPose(object, localTime) {
  const custom = object.keyframes || [];
  const frames = [...(custom.some(key => key.time === 0) ? [] : [{ time: 0, values: pose(object), easing: "linear" }]), ...custom].sort((a, b) => a.time - b.time);
  const rightIndex = frames.findIndex(key => key.time >= localTime);
  if (rightIndex < 0) return { ...frames.at(-1).values };
  const right = frames[rightIndex], left = frames[Math.max(0, rightIndex - 1)];
  let mix = right.time === left.time ? 1 : Math.max(0, Math.min(1, (localTime - left.time) / (right.time - left.time)));
  if (right.easing === "ease_out") mix = 1 - (1 - mix) ** 3;
  else if (right.easing === "spring") mix = Math.max(0, Math.min(1, 1 - Math.cos(mix * Math.PI * 2.5) * Math.exp(-mix * 5)));
  else if (right.easing === "ease_in_out") mix *= mix * (3 - 2 * mix);
  return Object.fromEntries(OBJECT_POSE_FIELDS.map(field => [field, left.values[field] + (right.values[field] - left.values[field]) * mix]));
}
