import * as PIXI from "pixi.js";

// Shader for a "Chromatic Aberration + Scanline" Glitch Effect
// This is pure GPU code (GLSL) running in the browser for free.
const glitchShaderFrag = `
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform float time;
uniform vec2 resolution;

float rand(vec2 co) {
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main(void) {
    vec2 uv = vTextureCoord;
    
    // 1. Scanline Distortion (Wobbly VHS)
    float scanline = sin(uv.y * 800.0 + time * 10.0) * 0.002;
    uv.x += scanline;
    
    // 2. Chromatic Aberration (RGB Split)
    // Shift Red/Blue channels based on sin wave
    float rOffset = 0.005 * sin(time * 3.0);
    float bOffset = -0.005 * cos(time * 2.5);
    
    vec4 r = texture2D(uSampler, vec2(uv.x + rOffset, uv.y));
    vec4 g = texture2D(uSampler, uv);
    vec4 b = texture2D(uSampler, vec2(uv.x + bOffset, uv.y));
    
    // 3. Noise Overlay
    float noise = rand(uv * time) * 0.1;
    
    gl_FragColor = vec4(r.r, g.g, b.b, 1.0) + noise;
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
    view: canvas,
    width: videoElement.videoWidth || 1080,
    height: videoElement.videoHeight || 1920,
    backgroundColor: 0x000000,
    backgroundAlpha: 0,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  // Create Video Texture
  // Note: Modern browsers require user interaction to play video texture sometimes.
  const texture = await PIXI.Assets.load(videoElement.src);
  // Or create manually if needed: const texture = PIXI.Texture.from(videoElement);

  const sprite = new PIXI.Sprite(texture);

  // Fit to screen (cover or contain logic)
  sprite.width = app.screen.width;
  sprite.height = app.screen.height;

  // Center anchor
  // sprite.anchor.set(0.5);
  // sprite.x = app.screen.width / 2;
  // sprite.y = app.screen.height / 2;

  app.stage.addChild(sprite);

  // Apply Custom Shader Filter
  const filter = new PIXI.Filter(null, glitchShaderFrag, {
    time: 0.0,
    resolution: [app.screen.width, app.screen.height],
  });

  sprite.filters = [filter];

  // Animation Loop
  app.ticker.add(delta => {
    filter.uniforms.time += 0.05 * delta;
  });

  return {
    destroy: () => {
      app.destroy(true, { children: true, texture: true, baseTexture: true });
    },
    app,
  };
}
