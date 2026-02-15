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
    
    // 1. Stronger Contrast (Pop)
    color.rgb = pow(color.rgb, vec3(1.3)); 
    
    // 2. Saturation Boost (Vital for "Cinema" look)
    float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    vec3 gray = vec3(luma);
    color.rgb = mix(gray, color.rgb, 1.4); // 40% more saturation

    // 3. Stronger Teal/Orange Grade
    vec3 teal = vec3(0.0, 0.2, 0.2); // More vibrant teal
    vec3 orange = vec3(0.2, 0.1, 0.0); // More vibrant orange
    
    if (luma < 0.5) {
        color.rgb += teal * (1.0 - luma) * 0.3; // Stronger shadow tint
    } else {
        color.rgb += orange * luma * 0.25; // Stronger highlight tint
    }
    
    // 4. Subtle Vignette (Focus on center)
    float dist = distance(uv, vec2(0.5));
    color.rgb *= smoothstep(0.8, 0.3, 1.0 - dist); // Darken edges

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

  // 1. Critical: Ensure we have enough video data to render a frame
  // Prevents "glCopySubTextureCHROMIUM" errors
  if (videoElement.readyState < 2) {
    await new Promise(r => {
      videoElement.addEventListener("canplay", r, { once: true });
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

  // SAFETY CHECK: Wait for video to have dimensions
  if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
    await new Promise(resolve => {
      videoElement.onloadedmetadata = resolve;
    });
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
    // Safety check: if app is destroyed, stop
    if (!sprite || sprite.destroyed) return;

    if (effectName === "green-screen") {
      sprite.filters = [greenScreenFilter];
      // Check uniforms existence before assignment
      if (greenScreenFilter.uniforms) {
        if (params.threshold !== undefined) greenScreenFilter.uniforms.threshold = params.threshold;
        if (params.smoothing !== undefined) greenScreenFilter.uniforms.smoothing = params.smoothing;
        if (params.keyColor !== undefined) greenScreenFilter.uniforms.keyColor = params.keyColor;
      } else if (greenScreenFilter.resources && greenScreenFilter.resources.uniforms) {
        // v8 fallback
        const u = greenScreenFilter.resources.uniforms.uniforms;
        if (params.threshold !== undefined) u.threshold = params.threshold;
        if (params.smoothing !== undefined) u.smoothing = params.smoothing;
        if (params.keyColor !== undefined) u.keyColor = params.keyColor;
      }
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
