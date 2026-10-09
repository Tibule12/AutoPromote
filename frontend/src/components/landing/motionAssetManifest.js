// Authored After Effects assets have not been supplied. These empty slots use
// the live web composition until a local, licensed export is configured here.
// Never label the live fallback as an After Effects render.
export const MOTION_ASSETS = [
  {
    id: "brand-reveal",
    format: "lottie",
    src: null,
    runtimeSrc: null,
    start: 0,
    end: 3.4,
    fit: "contain",
  },
  {
    id: "editor-light-pass",
    format: "video",
    sources: [],
    poster: null,
    start: 3.4,
    end: 16,
    transparent: true,
    fit: "contain",
  },
  {
    id: "clip-extraction",
    format: "video",
    sources: [],
    poster: null,
    start: 16,
    end: 22.4,
    transparent: true,
    fit: "contain",
  },
];

// Licensed sample footage, shared by the illustrative camera crops and outputs.
// Provenance and the original download are recorded in public/landing/README.md.
export const MOTION_TEXTURES = {
  host: "/landing/podcast-conversation.webp",
  guest: "/landing/podcast-conversation.webp",
  wide: "/landing/podcast-conversation.webp",
  video: "/landing/podcast-conversation.mp4",
};

export function assetIsConfigured(asset) {
  if (asset.format === "video") return Boolean(asset.sources?.some(source => source.src));
  return Boolean(asset.src && (asset.format !== "lottie" || asset.runtimeSrc));
}
