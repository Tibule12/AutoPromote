export const STUDIO_EXPORT_BLEND_MODES = Object.freeze(['normal','multiply','screen','difference',
  'overlay','soft-light','hard-light','color-dodge','luminosity']);

export function assertStudioLayerBlendMode(layer) {
  const mode = layer.blendMode || 'normal';
  if (!STUDIO_EXPORT_BLEND_MODES.includes(mode)) {
    const error = new Error(`${layer.name || layer.text || 'Visual layer'} uses ${mode}, which is not available for export. Choose a supported blend mode.`);
    error.code = 'UNSUPPORTED_LAYER_BLEND';
    throw error;
  }
  return mode;
}

export function assertStudioMainBlendMode(transform = {}) {
  if ((transform.blendMode || 'normal') !== 'normal') {
    const error = new Error('Main video blending is not available for export. Choose Normal on the main video; other supported modes apply to visual overlay layers.');
    error.code = 'UNSUPPORTED_MAIN_BLEND';
    throw error;
  }
}
