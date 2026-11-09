import React from 'react';
import { mediaColorizeId, mediaColorizeMatrix, validateStudioMediaColorize } from './studioMediaColorize';
export default function StudioMediaColorizeFilters({ layers }) {
  const active = layers.filter(layer => ['image','video'].includes(layer.type) && layer.colorize?.enabled);
  if (!active.length) return null;
  return <svg width="0" height="0" aria-hidden="true" style={{ position:'absolute', pointerEvents:'none' }}><defs>
    {active.map(layer => { const spec=validateStudioMediaColorize(layer.colorize); return <filter key={layer.id} id={mediaColorizeId(layer.id)} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feColorMatrix in="SourceGraphic" type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0" result="luminance" />
      <feComponentTransfer in="luminance" result="tone"><feFuncR type="gamma" amplitude={spec.contrast ?? 1} exponent={spec.gamma} offset={.27*(1-(spec.contrast ?? 1))} /><feFuncG type="gamma" amplitude={spec.contrast ?? 1} exponent={spec.gamma} offset={.27*(1-(spec.contrast ?? 1))} /><feFuncB type="gamma" amplitude={spec.contrast ?? 1} exponent={spec.gamma} offset={.27*(1-(spec.contrast ?? 1))} /><feFuncA type="identity" /></feComponentTransfer>
      <feColorMatrix in="tone" type="matrix" values={mediaColorizeMatrix(spec)} result="tinted" />
      <feComposite in="tinted" in2="SourceGraphic" operator="arithmetic" k1="0" k2={spec.strength} k3={1-spec.strength} k4="0" />
    </filter>})}
  </defs></svg>;
}
