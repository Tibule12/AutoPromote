// Authored geometric masks. Feather is measured in the Studio 720px programme
// coordinate system before layer scale; this is not subject segmentation.
const bounded = (value, min, max, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
};
export const hasSoftStudioMask = mask => !!mask?.enabled && (!!mask.inverted || Number(mask.feather) > 0 || !!mask.secondaryMasks?.length);
export const DEFAULT_STUDIO_MASK_POLYGON = 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)';
export function parseStudioMaskPolygon(path = DEFAULT_STUDIO_MASK_POLYGON) {
  const match = /^polygon\((.{1,2048})\)$/.exec(String(path).trim());
  const pairs = match?.[1].split(',') || [];
  if (pairs.length < 3 || pairs.length > 64) throw new Error('Use a percentage polygon with 3 to 64 points.');
  return pairs.map(pair => {
    const point = /^\s*(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%\s*$/.exec(pair);
    if (!point || !Number.isFinite(Number(point[1])) || !Number.isFinite(Number(point[2])))
      throw new Error('Each polygon point needs two finite percentages, for example 10% 20%.');
    return [Number(point[1]), Number(point[2])];
  });
}
export const studioMaskPointProperty = property => /^maskPoint(\d{1,2})(X|Y)$/.exec(String(property));
export const studioMaskPolygonPath = points => `polygon(${points.map(p => p.map(n=>Number(n).toFixed(8).replace(/\.?0+$/,'')).join('% ')+'%').join(', ')})`;

export function computeSmoothMaskBezierHandles(points = [], tension = 0.28) {
  const n = Array.isArray(points) ? points.length : 0;
  if (n < 3) return [];
  const t = Math.max(0.05, Math.min(0.5, Number(tension) || 0.28));
  return points.map((pt, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const vx = (next[0] - prev[0]) * t;
    const vy = (next[1] - prev[1]) * t;
    return [Number((-vx).toFixed(3)), Number((-vy).toFixed(3)), Number(vx.toFixed(3)), Number(vy.toFixed(3))];
  });
}

export function evaluateCubicBezierMaskPoints(mask, stepsPerSegment = 10) {
  const pts = parseStudioMaskPolygon(mask?.path || DEFAULT_STUDIO_MASK_POLYGON);
  const handles = Array.isArray(mask?.bezierHandles) ? mask.bezierHandles : null;
  if (!handles || handles.length !== pts.length) return pts;
  const steps = Math.max(2, Math.min(24, Math.round(stepsPerSegment)));
  const out = [];
  for (let i = 0; i < pts.length; i += 1) {
    const next = (i + 1) % pts.length;
    const [x0, y0] = pts[i];
    const [x3, y3] = pts[next];
    const h0 = handles[i] || [0, 0, 0, 0];
    const h1 = handles[next] || [0, 0, 0, 0];
    const ox = Number(h0[2] || 0), oy = Number(h0[3] || 0);
    const ix = Number(h1[0] || 0), iy = Number(h1[1] || 0);
    if (Math.abs(ox) < 1e-4 && Math.abs(oy) < 1e-4 && Math.abs(ix) < 1e-4 && Math.abs(iy) < 1e-4) {
      out.push([x0, y0]);
      continue;
    }
    const c1x = x0 + ox, c1y = y0 + oy;
    const c2x = x3 + ix, c2y = y3 + iy;
    for (let s = 0; s < steps; s += 1) {
      const u = s / steps, m = 1 - u;
      const b0 = m * m * m, b1 = 3 * m * m * u, b2 = 3 * m * u * u, b3 = u * u * u;
      out.push([b0 * x0 + b1 * c1x + b2 * c2x + b3 * x3, b0 * y0 + b1 * c1y + b2 * c2y + b3 * y3]);
    }
  }
  return out;
}

export function validateStudioMaskAnimation(layer, keys = []) {
  const secondary=layer?.mask?.secondaryMasks||[];
  if(!Array.isArray(secondary)||secondary.length>8)throw Error('Use at most eight secondary masks.');
  for(const sub of secondary){
    if(!sub||typeof sub!=='object'||sub.secondaryMasks?.length||!['ellipse','rectangle','polygon','diamond','inset'].includes(sub.shape)||!['add','subtract','intersect','difference'].includes(sub.booleanOp||layer.mask.booleanMode||'add')||!Number.isFinite(Number(sub.feather??0))||Number(sub.feather??0)<0||Number(sub.feather??0)>100)throw Error('Invalid secondary mask shape, feather or operation.');
    if(sub.shape==='polygon')parseStudioMaskPolygon(sub.path);
  }
  if (layer?.mask?.bezierHandles !== undefined) {
    const handles = layer.mask.bezierHandles;
    if (!Array.isArray(handles) || handles.length > 64 || handles.some(h => !Array.isArray(h) || h.length !== 4 || h.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < -100 || n > 100))) {
      throw Error('Mask Bézier handles require 4 finite tangent deltas [-100..100] per vertex.');
    }
    if (layer.mask.shape === 'polygon') {
      const pts = parseStudioMaskPolygon(layer.mask.path);
      if (handles.length && handles.length !== pts.length) {
        throw Error('Mask Bézier handles length must match polygon vertices.');
      }
    }
  }
  const animated = keys.filter(key => String(key.property).startsWith('maskPoint'));
  if (!animated.length) return;
  if (layer?.mask?.shape !== 'polygon' || !['image', 'video'].includes(layer.type))
    throw Error('Point animation needs a polygon on an ordinary image or video layer. Remove its point keys before changing topology.');
  const points = parseStudioMaskPolygon(layer.mask.path);
  for (const key of animated) {
    const match = studioMaskPointProperty(key.property);
    if (!match || Number(match[1]) >= points.length || typeof key.value !== 'number' || !Number.isFinite(key.value) ||
        key.value < -100 || key.value > 200 || typeof key.time !== 'number' || !Number.isFinite(key.time) || key.time < 0)
      throw Error('Mask point keys need an existing point, finite time and coordinates between -100 and 200%.');
  }
}
export function studioLayerMaskSvg(mask, cropX, cropY, width, height, programmeScale = 1) {
  if (!mask?.enabled) return null;
  if(mask.secondaryMasks?.length){
    if(!Array.isArray(mask.secondaryMasks)||mask.secondaryMasks.length>8)throw Error('Use at most eight secondary masks.');
    const base=studioLayerMaskSvg({...mask,secondaryMasks:[]},cropX,cropY,width,height,programmeScale);
    const uri=svg=>`data:image/svg+xml,${encodeURIComponent(svg)}`;let chain='';
    for(const [i,sub]of mask.secondaryMasks.entries()){
      const op=sub.booleanOp||mask.booleanMode||'add';if(!['add','subtract','intersect','difference'].includes(op))throw Error('Invalid mask boolean operation.');
      if(sub.secondaryMasks?.length)throw Error('Nested secondary masks are unsupported.');
      const shape=studioLayerMaskSvg({...sub,enabled:true,secondaryMasks:[]},0,0,width,height,programmeScale);
      chain+=`<feImage href="${uri(shape)}" result="sub${i}"/><feComposite in="${i?'step'+(i-1):'SourceGraphic'}" in2="sub${i}" operator="${{add:'over',subtract:'out',intersect:'in',difference:'xor'}[op]}" result="step${i}"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><filter id="boolean" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${chain}</filter></defs><image href="${uri(base)}" width="100%" height="100%" filter="url(#boolean)"/></svg>`;
  }
  const w = bounded(width, 1, 16384, 1), h = bounded(height, 1, 16384, 1);
  const x = w * bounded(cropX, 0, 45) / 100, y = h * bounded(cropY, 0, 45) / 100;
  const sigma = bounded(mask.feather, 0, 100) * bounded(programmeScale, .0001, 16, 1);
  let shape;
  const fill = 'white';
  const filter = sigma > 0 || mask.inverted ? ' filter="url(#soft)"' : '';
  if (mask.shape === 'ellipse') {
    shape = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * .48}" ry="${h * .48}" fill="${fill}"${filter}/>`;
  } else if (mask.shape === 'polygon') {
    const rawPts = parseStudioMaskPolygon(mask.path || DEFAULT_STUDIO_MASK_POLYGON);
    const handles = Array.isArray(mask.bezierHandles) && mask.bezierHandles.length === rawPts.length ? mask.bezierHandles : null;
    if (handles) {
      let d = '';
      for (let i = 0; i < rawPts.length; i += 1) {
        const next = (i + 1) % rawPts.length;
        const [x0, y0] = rawPts[i], [x3, y3] = rawPts[next];
        const h0 = handles[i] || [0, 0, 0, 0], h1 = handles[next] || [0, 0, 0, 0];
        const px0 = x0 * w / 100, py0 = y0 * h / 100;
        const c1x = (x0 + Number(h0[2] || 0)) * w / 100, c1y = (y0 + Number(h0[3] || 0)) * h / 100;
        const c2x = (x3 + Number(h1[0] || 0)) * w / 100, c2y = (y3 + Number(h1[1] || 0)) * h / 100;
        const px3 = x3 * w / 100, py3 = y3 * h / 100;
        d += i === 0 ? `M ${px0} ${py0} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${px3} ${py3} ` : `C ${c1x} ${c1y}, ${c2x} ${c2y}, ${px3} ${py3} `;
      }
      shape = `<path d="${d}Z" fill="${fill}"${filter}/>`;
    } else {
      const points = rawPts.map(([px, py]) => `${px * w / 100},${py * h / 100}`).join(' ');
      shape = `<polygon points="${points}" fill="${fill}"${filter}/>`;
    }
  } else if (mask.shape === 'diamond') {
    shape = `<polygon points="${w / 2},${y} ${w - x},${h / 2} ${w / 2},${h - y} ${x},${h / 2}" fill="${fill}"${filter}/>`;
  } else {
    const ix = mask.shape === 'inset' ? Math.max(x, w * .1) : x;
    const iy = mask.shape === 'inset' ? Math.max(y, h * .1) : y;
    const radius = bounded(mask.radius ?? 6, 0, 50, 6) / 100;
    shape = `<rect x="${ix}" y="${iy}" width="${w - ix * 2}" height="${h - iy * 2}" rx="${Math.min(w * radius, (w - ix * 2) / 2)}" ry="${Math.min(h * radius, (h - iy * 2) / 2)}" fill="${fill}"${filter}/>`;
  }
  // Invert alpha directly. A black/white luminance mask applies color-space
  // conversion to partial coverage and changes the authored Gaussian edge.
  const soft = sigma > 0 || mask.inverted ? `<filter id="soft" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" color-interpolation-filters="sRGB">${sigma > 0 ? `<feGaussianBlur stdDeviation="${sigma}"/>` : ''}${mask.inverted ? '<feComponentTransfer><feFuncA type="linear" slope="-1" intercept="1"/></feComponentTransfer>' : ''}</filter>` : '';
  const content = `<defs>${soft}</defs>${shape}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${content}</svg>`;
}
