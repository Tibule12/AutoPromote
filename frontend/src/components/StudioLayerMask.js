import React, { useLayoutEffect, useRef } from 'react';
import { hasSoftStudioMask, studioLayerMaskSvg } from './studioMaskGeometry';

// Modifies the existing native layer's mask. It creates no alternate project,
// media source or editing surface. ResizeObserver keeps the local mask box exact.
export default function StudioLayerMask({ mask, cropX, cropY, title, stageRef }) {
  const marker = useRef(null);
  useLayoutEffect(() => {
    const layer = marker.current?.parentElement;
    if (!layer) return undefined;
    const update = () => {
      let uri = '';
      if (hasSoftStudioMask(mask) && layer.clientWidth && layer.clientHeight) {
        const scale = title ? 1 : (stageRef.current?.clientHeight || 720) / 720;
        const svg = studioLayerMaskSvg(mask, cropX, cropY, layer.clientWidth, layer.clientHeight, scale);
        uri = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
      }
      layer.style.maskImage = uri;
      layer.style.webkitMaskImage = uri;
      layer.style.maskSize = '100% 100%';
      layer.style.webkitMaskSize = '100% 100%';
      layer.style.maskRepeat = 'no-repeat';
      layer.style.maskMode = 'alpha';
      layer.dataset.maskFeather = String(mask?.enabled ? Number(mask.feather || 0) : 0);
      layer.dataset.maskInverted = String(!!mask?.enabled && !!mask.inverted);
    };
    update();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(layer);
    if (stageRef.current) observer?.observe(stageRef.current);
    return () => { observer?.disconnect(); layer.style.maskImage = ''; layer.style.webkitMaskImage = ''; };
  }, [mask, cropX, cropY, title, stageRef]);
  return <span ref={marker} style={{ display: 'none' }} aria-hidden="true" />;
}
