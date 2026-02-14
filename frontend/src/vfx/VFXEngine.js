import * as PIXI from "pixi.js";

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

  // Create Pixi Application
  const app = new PIXI.Application();

  await app.init({
    canvas: canvas, // Updated for PixiJS v8+ (was 'view')
    width: videoElement.videoWidth || 1080,
    height: videoElement.videoHeight || 1920,
    backgroundColor: 0x000000,
    backgroundAlpha: 1, // Set to 1 for black bars
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    resizeTo: canvas, // Auto-resize to match the canvas element size in DOM
  });

  // Create Video Texture
  // Using direct DOM element source
  const texture = PIXI.Texture.from(videoElement);

  // Ensure valid texture dimensions before creating sprite
  if (!texture.valid) {
    await new Promise(resolve => {
      texture.once("update", resolve);
      // Failsafe if already updated
      if (texture.valid) resolve();
    });
  }

  const sprite = new PIXI.Sprite(texture);

  // Aspect Ratio Fitting Logic (Start with Contain)
  // We want to CONTAIN the video so it is fully visible (Letterbox style)

  const fitAspectRatio = () => {
    const screenW = app.screen.width;
    const screenH = app.screen.height;
    const videoW = texture.width; // Should be valid now
    const videoH = texture.height;

    if (videoW && videoH) {
      const scale = Math.min(screenW / videoW, screenH / videoH);
      sprite.scale.set(scale);

      // Center it
      sprite.x = (screenW - videoW * scale) / 2;
      sprite.y = (screenH - videoH * scale) / 2;
    }
  };

  fitAspectRatio();

  // Re-calculate on resize
  app.renderer.on("resize", fitAspectRatio);

  app.stage.addChild(sprite);

  // Apply "Cinema Gloss" Shader
  const simpleFilter = new PIXI.Filter(undefined, cinemaShaderFrag, {
    time: 0.0,
    resolution: [app.screen.width, app.screen.height],
  });

  sprite.filters = [simpleFilter];

  // Animation Loop - Safe Access
  app.ticker.add(delta => {
    // Check if uniforms object exists before assigning
    if (simpleFilter.uniforms) {
      simpleFilter.uniforms.time += 0.05 * delta.deltaTime;
    } else if (simpleFilter.resources && simpleFilter.resources.uniforms) {
      // v8 fallback
      simpleFilter.resources.uniforms.uniforms.time += 0.05 * delta.deltaTime;
    }
  });

  return {
    destroy: () => {
      app.destroy(true, { children: true, texture: true, baseTexture: true });
    },
    app,
  };
}
