// Image effects share the mask/title programme coordinates. The native layer
// transform scales this filtered group after these pixel values are resolved.
export function studioMediaEffectFilter(overlay) {
  const pixels = value => {
    const n = Number(value);
    return overlay.type === 'image' && n !== 0
      ? `calc(${n}px * var(--title-preview-scale, 1))` : `${n}px`;
  };
  const color = (value, opacity) => `color-mix(in srgb, ${value} ${Math.round(Number(opacity) * 100)}%, transparent)`;
  return [
    overlay.layerShadow?.enabled
      ? `drop-shadow(${pixels(overlay.layerShadow.x ?? 0)} ${pixels(overlay.layerShadow.y ?? 10)} ${pixels(overlay.layerShadow.blur ?? 18)} ${color(overlay.layerShadow.color || '#000000', overlay.layerShadow.opacity ?? .55)})` : '',
    overlay.glow?.enabled
      ? `drop-shadow(0 0 ${pixels(overlay.glow.radius ?? 16)} ${color(overlay.glow.color || '#8b5cf6', overlay.glow.intensity ?? .5)})` : '',
    Number(overlay.blur || 0) > 0 ? `blur(${pixels(overlay.blur)})` : '',
  ].filter(Boolean).join(' ') || 'none';
}
