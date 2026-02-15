import * as PIXI from "pixi.js";
import { greenScreenFrag } from "./shaders";

// Shader for a "Cinema Gloss" Effect (Subtle Color Grade + Bloom)
// Replaces the heavy "Glitch" shader for a premium look
const cinemaShaderFrag = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float time;
uniform vec2 resolution;

void main(void) {
    vec2 uv = vTextureCoord;
    vec4 color = texture2D(uSampler, uv);
    
    // 1. Subtle S-Curve Contrast (Cinematic Look)
    color.rgb = pow(color.rgb, vec3(1.1)); // Slight contrast boost
    
    // 2. Warm/Teal Grade (Teal Shadows, Warm Highlights)
    vec3 teal = vec3(0.0, 0.1, 0.1);
    vec3 orange = vec3(0.1, 0.05, 0.0);
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    
    if (luma < 0.5) {
        color.rgb += teal * (1.0 - luma) * 0.2;
    } else {
        color.rgb += orange * luma * 0.15;
    }
    
    // 3. Vignette (Darken corners)
    float dist = distance(uv, vec2(0.5));
    color.rgb *= smoothstep(0.8, 0.4, dist * (resolution.x / resolution.y));

    gl_FragColor = color;
}
`;

/**
 * Initialize the VFX Engine on a Canvas
 * @param {HTMLCanvasElement} canvas The canvas to render to
 * @param {HTMLVideoElement} videoElement The source video element
 */
export async function initVFXEngine(canvas, videoElement) {
  if (!canvas || !videoElement) return null;

  // 1. Critical: Ensure we have intrinsic video dimensions
  // This prevents the "zoom/crop" bug by matching Pixi buffer 1:1 with Video file
  if (videoElement.readyState < 1) {
    await new Promise(r => {
      videoElement.onloadedmetadata = r;
    });
  }
  const vWidth = videoElement.videoWidth || 1280;
  const vHeight = videoElement.videoHeight || 720;

  // Create Pixi Application
  const app = new PIXI.Application();

  await app.init({
    canvas: canvas,
    width: vWidth,
    height: vHeight,
    backgroundColor: 0x000000,
    backgroundAlpha: 0, // Transparent for Green Screen alpha
    resolution: 1, // Fix resolution to 1 to match video pixels exactly
    autoDensity: false, // Let CSS handle the UI scaling
    resizeTo: undefined, // DISABLE DOM resizing which causes the drift/crop issues
  });

  // Create VideoSource explicitly to bypass URL parsing (essential for Blob URLs)
  const source = new PIXI.VideoSource({
    resource: videoElement,
    autoPlay: true,
    loop: true,
    autoLoad: true, // Force load immediately
  });

  // Create texture from the source directly - bypassing Assets loader
  const texture = new PIXI.Texture({ source });

  // Wait for the source to be ready with a safety timeout (5 seconds)
  // This prevents the engine from hanging if the browser delays the video load event
  try {
    const loadPromise = source.load();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Source load timeout")), 5000)
    );
    await Promise.race([loadPromise, timeoutPromise]);
  } catch (e) {
    console.warn("VFX Engine: Source load warning (proceeding anyway):", e);
  }

  // Ensure valid texture dimensions before creating sprite
  // Force a tiny seek so the video decodes *something* (often needed on Chrome/Edge)
  if (videoElement.paused && videoElement.currentTime < 0.1) {
    videoElement.currentTime = 0.001;
  }

  const sprite = new PIXI.Sprite(texture);

  // 2. Simple Layout: Fill the Stage
  // Since stage == video size, this maps 1:1 without complex math
  sprite.width = vWidth;
  sprite.height = vHeight;

  // Default Filter (Cinema)
  const cinemaFilter = new PIXI.Filter(undefined, cinemaShaderFrag, {
    time: 0.0,
    resolution: [app.screen.width, app.screen.height],
  });

  // Green Screen Filter (Initialized but not default)
  const greenScreenFilter = new PIXI.Filter(undefined, greenScreenFrag, {
    threshold: 0.1,
    smoothing: 0.05,
    keyColor: [0.0, 1.0, 0.0], // RGB Green
  });

  sprite.filters = [cinemaFilter];

  // ADD TO STAGE (Critical Fix: Sprite must be added to be visible)
  app.stage.addChild(sprite);

  // Animation Loop - Safe Access
  app.ticker.add(delta => {
    // Manually force update video source every frame - fixes black screen on some browsers
    if (texture.source && texture.source.update) {
      texture.source.update();
    }

    // Update Time for Cinema Filter
    if (cinemaFilter.uniforms) {
      cinemaFilter.uniforms.time += 0.05 * delta.deltaTime;
    }
  });

  // Interface to control effects
  const setEffect = (effectName, params = {}) => {
    if (effectName === "green-screen") {
      sprite.filters = [greenScreenFilter];
      if (params.threshold !== undefined) greenScreenFilter.uniforms.threshold = params.threshold;
      if (params.smoothing !== undefined) greenScreenFilter.uniforms.smoothing = params.smoothing;
      if (params.keyColor !== undefined) greenScreenFilter.uniforms.keyColor = params.keyColor;
    } else if (effectName === "cinema") {
      sprite.filters = [cinemaFilter];
    } else {
      sprite.filters = [];
    }
  };

  return {
    destroy: () => {
      app.destroy(true, { children: true, texture: true, baseTexture: true });
    },
    app,
    setEffect,
  };
}
