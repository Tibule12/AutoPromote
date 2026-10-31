// Ordinary media rectangle -> convex quad, before the existing layer transform.
export const PERSPECTIVE_IDENTITY = [[0, 0], [100, 0], [100, 100], [0, 100]];
export const PERSPECTIVE_LEFT = [[0, 12], [88, 0], [88, 100], [0, 88]];
export const PERSPECTIVE_RIGHT = [[12, 0], [100, 12], [100, 88], [12, 100]];

export function encodeStudioPerspective(value) {
  validateStudioPerspective(value);
  // Firestore workflow records cannot represent directly nested arrays.
  return { version: 1, corners: value.corners.flat() };
}

export function validateStudioPerspective(value) {
  if (!value || value.version !== 1 || Object.keys(value).some(k => !['version', 'corners'].includes(k)) ||
      !Array.isArray(value.corners) || value.corners.length !== 4)
    throw Error('Perspective needs four ordered corners: top left, top right, bottom right, bottom left.');
  const p = value.corners;
  if (p.some(row => !Array.isArray(row) || row.length !== 2 || row.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100)))
    throw Error('Perspective corners must be finite percentages between 0 and 100.');
  for (let i = 0; i < 4; i++) {
    const a = p[i], b = p[(i + 1) % 4], c = p[(i + 2) % 4];
    if ((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]) < 500)
      throw Error('Perspective corners must form a clockwise convex plane with room between its edges.');
  }
  return value;
}

export function validateStudioPerspectiveLayer(layer, keys = [], grouped = false) {
  if (!layer?.perspective) {
    if (keys.some(k => k.property === 'perspectiveProgress')) throw Error('Perspective keys need a media plane.');
    return;
  }
  validateStudioPerspective(layer.perspective);
  if (!['image', 'video'].includes(layer.type) || layer.id === 'main-video' || layer.vectorShape || grouped ||
      layer.bRollMode === 'fullscreen' || layer.mask?.enabled || layer.cropX || layer.cropY || layer.motionBlur?.enabled ||
      keys.some(k => ['cropX','cropY'].includes(k.property) && k.value !== 0))
    throw Error('Perspective supports ungrouped ordinary image/video planes without masks, crop or motion blur.');
  const values = [layer.perspectiveProgress ?? 100, ...keys.filter(k => k.property === 'perspectiveProgress').map(k => k.value)];
  if (values.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100))
    throw Error('Perspective progress must be between 0 and 100.');
}

export function perspectiveCorners(value, progress = 100) {
  validateStudioPerspective(value);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) throw Error('Invalid perspective progress.');
  const corners = value.corners.map((p, i) => p.map((n, j) => (PERSPECTIVE_IDENTITY[i][j] + (n-PERSPECTIVE_IDENTITY[i][j])*progress/100)/100));
  // Validate every evaluated quad as well as the authored endpoint.
  validateStudioPerspective({version: 1, corners: corners.map(p => p.map(n => n*100))});
  return corners;
}

export function perspectiveHomography(corners) {
  const [[x0,y0],[x1,y1],[x2,y2],[x3,y3]] = corners;
  const dx1=x1-x2, dx2=x3-x2, dy1=y1-y2, dy2=y3-y2;
  const dx3=x0-x1+x2-x3, dy3=y0-y1+y2-y3;
  const det=dx1*dy2-dx2*dy1;
  const g=(dx3*dy2-dx2*dy3)/det, h=(dx1*dy3-dx3*dy1)/det;
  return [x1-x0+g*x1, x3-x0+h*x3, x0, y1-y0+g*y1, y3-y0+h*y3, y0, g, h, 1];
}

export function perspectiveCssMatrix(value, progress, width, height) {
  const [a,b,c,d,e,f,g,h] = perspectiveHomography(perspectiveCorners(value, progress));
  return `matrix3d(${[a,d*height/width,0,g/width,b*width/height,e,0,h/height,0,0,1,0,c*width,f*height,0,1].join(',')})`;
}
