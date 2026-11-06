// Geometry of the canonical worker stages: reviewed source crop, centered
// Director crop, then inset footage frame. Collapsing these into one zoom on
// the inner monitor changes the focus point whenever it is away from centre.
export function studioSoloPictureDimensions({ sourceWidth, sourceHeight, aspect, resolution, frame }) {
  const sizes = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "16:9": [1920, 1080] };
  if (!sizes[aspect] || !["720p", "1080p", "4k", "source"].includes(resolution) ||
      ![sourceWidth, sourceHeight].every(n => Number.isFinite(n) && n > 0)) return null;
  let [width, height] = sizes[aspect];
  const scale = resolution === "720p" ? 2 / 3 : resolution === "source"
    ? Math.min(1, sourceWidth / width, sourceHeight / height) : 1;
  width = Math.floor(width * scale / 2) * 2; height = Math.floor(height * scale / 2) * 2;
  const inset = frame?.enabled ? Math.min(Math.round(width * Math.max(0, Math.min(10,
    Number(frame.insetPercent) || 0)) / 100), Math.floor(Math.min(width, height) / 10)) : 0;
  return { width, height, inset, innerWidth: (width - 2 * inset) & ~1, innerHeight: (height - 2 * inset) & ~1 };
}

export function studioSoloPictureProjection({
  sourceWidth,
  sourceHeight,
  canvasWidth,
  canvasHeight,
  aspect,
  resolution,
  x,
  y,
  zoom = 1,
  directorZoom = 1,
  frame,
}) {
  const dimensions = studioSoloPictureDimensions({sourceWidth,sourceHeight,aspect,resolution,frame});
  if (
    !dimensions ||
    ![sourceWidth, sourceHeight, canvasWidth, canvasHeight, x, y, zoom, directorZoom].every(
      Number.isFinite
    ) ||
    [sourceWidth, sourceHeight, canvasWidth, canvasHeight].some(n => n <= 0)
  )
    return null;
  const {width,height} = dimensions;
  const requestedWidth = Math.ceil((width * zoom) / 2) * 2,
    requestedHeight = Math.ceil((height * zoom) / 2) * 2;
  const scale = Math.max(requestedWidth / sourceWidth, requestedHeight / sourceHeight);
  const scaledWidth = Math.round(sourceWidth * scale),
    scaledHeight = Math.round(sourceHeight * scale);
  const chroma = value => Math.round(value) & ~1;
  let left = -chroma((scaledWidth - width) * x),
    top = -chroma((scaledHeight - height) * y);
  let drawWidth = scaledWidth,
    drawHeight = scaledHeight;
  if (directorZoom > 1.001) {
    const cropWidth = Math.floor(width / directorZoom / 2) * 2,
      cropHeight = Math.floor(height / directorZoom / 2) * 2;
    left = ((left - chroma((width - cropWidth) / 2)) * width) / cropWidth;
    top = ((top - chroma((height - cropHeight) / 2)) * height) / cropHeight;
    drawWidth *= width / cropWidth;
    drawHeight *= height / cropHeight;
  }
  let innerWidth = width,
    innerHeight = height;
  if (frame?.enabled) {
    const inset = Math.min(
      Math.round((width * Math.max(0, Math.min(10, Number(frame.insetPercent) || 0))) / 100),
      Math.floor(Math.min(width, height) / 10)
    );
    innerWidth = (width - 2 * inset) & ~1;
    innerHeight = (height - 2 * inset) & ~1;
    const fit = Math.max(innerWidth / width, innerHeight / height);
    const fittedWidth = Math.round(width * fit),
      fittedHeight = Math.round(height * fit);
    left = (left * fittedWidth) / width - chroma((fittedWidth - innerWidth) / 2);
    top = (top * fittedHeight) / height - chroma((fittedHeight - innerHeight) / 2);
    drawWidth *= fittedWidth / width;
    drawHeight *= fittedHeight / height;
  }
  return {
    x: (left * canvasWidth) / innerWidth,
    y: (top * canvasHeight) / innerHeight,
    width: (drawWidth * canvasWidth) / innerWidth,
    height: (drawHeight * canvasHeight) / innerHeight,
  };
}
