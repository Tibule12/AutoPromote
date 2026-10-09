import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

export function roundRect(ctx, x, y, w, h, radius = 12) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

export function cover(ctx, image, x, y, w, h, focusX = 0.5, zoom = 1, focusY = 0.4) {
  const iw = image.videoWidth || image.naturalWidth || image.width;
  const ih = image.videoHeight || image.naturalHeight || image.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih) * zoom;
  ctx.drawImage(
    image,
    Math.max(0, Math.min(iw - w / scale, iw * focusX - w / scale / 2)),
    Math.max(0, Math.min(ih - h / scale, ih * focusY - h / scale / 2)),
    w / scale,
    h / scale,
    x,
    y,
    w,
    h
  );
}

export function makeTexture(width, height, draw) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  draw(context, width, height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, context, canvas };
}

export function panelTexture(
  title,
  subtitle,
  image,
  { width = 640, height = 400, portrait = false, focusX = 0.5, zoom = 1, videoWindow = false } = {}
) {
  return makeTexture(width, height, (ctx, w, h) => {
    roundRect(ctx, 1, 1, w - 2, h - 2, 18);
    ctx.fillStyle = "#13141d";
    ctx.fill();
    ctx.strokeStyle = "#70667f";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.save();
    roundRect(ctx, 10, 53, w - 20, h - 100, 10);
    ctx.clip();
    if (videoWindow) ctx.clearRect(10, 53, w - 20, h - 100);
    else if (image) cover(ctx, image, 10, 53, w - 20, h - 100, focusX, zoom);
    const gradient = ctx.createLinearGradient(0, h * 0.4, 0, h - 44);
    gradient.addColorStop(0, "transparent");
    gradient.addColorStop(1, "#10071ad9");
    ctx.fillStyle = gradient;
    ctx.fillRect(10, 53, w - 20, h - 100);
    ctx.restore();
    ctx.fillStyle = "#ccb2ef";
    ctx.font = `600 ${portrait ? 22 : 24}px Segoe UI, sans-serif`;
    ctx.fillText(title, 22, 34);
    ctx.fillStyle = "#b3a5c9";
    ctx.font = `${portrait ? 16 : 18}px Segoe UI, sans-serif`;
    ctx.fillText(subtitle, 22, h - 20);
    if (portrait) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 31px Segoe UI, sans-serif";
      ctx.fillText("Make every", 22, h - 148);
      ctx.fillStyle = "#964ee8";
      roundRect(ctx, 15, h - 136, w - 32, 43, 5);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText("moment count.", 22, h - 105);
    }
  });
}

export function labelTexture(title, subtitle = "", width = 600, height = 120) {
  return makeTexture(width, height, (ctx, w, h) => {
    roundRect(ctx, 1, 1, w - 2, h - 2, 16);
    ctx.fillStyle = "#1b1925f5";
    ctx.fill();
    ctx.strokeStyle = "#756784";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#e9d9fc";
    ctx.font = "600 29px Segoe UI, sans-serif";
    ctx.fillText(title, 24, subtitle ? 46 : 72);
    if (subtitle) {
      ctx.fillStyle = "#bda3d6";
      ctx.font = "21px Segoe UI, sans-serif";
      ctx.fillText(subtitle, 24, 85);
    }
  });
}

const imageCache = new Map();
export function loadSceneImage(src) {
  if (!imageCache.has(src))
    imageCache.set(
      src,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Cannot load local demo asset ${src}`));
        image.src = src;
      }).catch(error => {
        imageCache.delete(src);
        throw error;
      })
    );
  return imageCache.get(src);
}
