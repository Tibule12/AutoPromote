// A decoded ordinary video supplies pixels to the existing track-matte stage.
// Geometry uses the same world pose as every other layer; no saved state or
// second animation clock lives here. The CPU compositor already consumes these
// video pixels. Unsupported source effects are refused by shared validation.
export function studioVideoMatteUri({ video, picture, layer, pose, time, aspect, canvas }) {
  const pixels = picture || video;
  const sourceWidth = pixels?.videoWidth || pixels?.naturalWidth || pixels?.width;
  const sourceHeight = pixels?.videoHeight || pixels?.naturalHeight || pixels?.height;
  if (!picture && (!video || video.readyState < 2 || video.seeking)) return null;
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;
  if (!canvas || !Number.isFinite(aspect) || aspect <= 0) return null;
  const width = Math.max(1, Math.round(aspect >= 1 ? 640 : 640 * aspect));
  const height = Math.max(1, Math.round(aspect >= 1 ? 640 / aspect : 640));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, width, height);
  const start = Number(layer.startTime ?? layer.start_time ?? 0), end = start + Number(layer.duration || 0);
  const opacity = time >= start && time < end ? Math.max(0, Math.min(1, Number(pose.opacity ?? 1))) : 0;
  const boxWidth = width * Number(layer.width || 35) / 100 * Number(pose.scale ?? 1);
  const boxHeight = height * Number(layer.height || 35) / 100 * Number(pose.scale ?? 1);
  const fit = layer.mediaFit || 'contain';
  const ratio = fit === 'cover' ? Math.max(boxWidth / sourceWidth, boxHeight / sourceHeight)
    : Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
  const drawWidth = fit === 'stretch' ? boxWidth : sourceWidth * ratio;
  const drawHeight = fit === 'stretch' ? boxHeight : sourceHeight * ratio;
  const x = -boxWidth * Number(layer.anchorX ?? 50) / 100, y = -boxHeight * Number(layer.anchorY ?? 50) / 100;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(width * Number(pose.x ?? 50) / 100, height * Number(pose.y ?? 50) / 100);
  ctx.rotate(Number(pose.rotation || 0) * Math.PI / 180);
  ctx.beginPath(); ctx.rect(x, y, boxWidth, boxHeight); ctx.clip();
  if ((layer.frameShape || 'round') !== 'edge') {
    const radius = Math.max(12, Math.min(48, Number(layer.borderRadius ?? 28))) / 400;
    ctx.beginPath();
    ctx.roundRect(x, y, boxWidth, boxHeight, { x: boxWidth * radius, y: boxHeight * radius });
    ctx.clip();
  }
  const cropX = Math.max(0, Math.min(45, Number(pose.cropX || 0))) / 100;
  const cropY = Math.max(0, Math.min(45, Number(pose.cropY || 0))) / 100;
  if (cropX || cropY) {
    ctx.beginPath();
    ctx.rect(x + boxWidth * cropX, y + boxHeight * cropY, boxWidth * (1 - 2 * cropX), boxHeight * (1 - 2 * cropY));
    ctx.clip();
  }
  ctx.drawImage(pixels, x + (boxWidth - drawWidth) / 2, y + (boxHeight - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
  return canvas;
}

export function studioVideoMatteAlpha(canvas, mode) {
  const ctx = canvas?.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height), bytes = pixels.data;
  const luma = mode === 'luma' || mode === 'luma_inverted';
  const inverted = mode === 'alpha_inverted' || mode === 'luma_inverted';
  for (let i = 0; i < bytes.length; i += 4) {
    const alpha = luma ? bytes[i + 3] * (.2126 * bytes[i] + .7152 * bytes[i + 1] + .0722 * bytes[i + 2]) / 255 : bytes[i + 3];
    bytes[i] = 255; bytes[i + 1] = 255; bytes[i + 2] = 255;
    bytes[i + 3] = inverted ? 255 - alpha : alpha;
  }
  ctx.putImageData(pixels, 0, 0);
  return `url("${canvas.toDataURL('image/png')}")`;
}
