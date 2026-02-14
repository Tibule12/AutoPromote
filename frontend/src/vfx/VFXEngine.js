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
    canvas: canvas, // Updated for PixiJS v8+ (was 'view')
    width: videoElement.videoWidth || 1080,
    height: videoElement.videoHeight || 1920,
    backgroundColor: 0x000000,
    backgroundAlpha: 0,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  // Create Video Texture
  // Direct creation from DOM element is more robust for Blobs than Assets.load
  const texture = PIXI.Texture.from(videoElement);
  const sprite = new PIXI.Sprite(texture);

  sprite.width = app.screen.width;
  sprite.height = app.screen.height;

  // Center anchor
  // sprite.anchor.set(0.5);
  // sprite.x = app.screen.width / 2;
  // sprite.y = app.screen.height / 2;

  app.stage.addChild(sprite);

  // Apply Custom Shader Filter
  // PixiJS v8 changed how uniforms are handled. It wraps them in a resources object for WebGPU compatibility.
  // We need to define the resource structure explicitly or update the uniforms property safely.

  const filter = new PIXI.Filter({
    glProgram: PIXI.GlProgram.from({
      vertex: `
            attribute vec2 aPosition;
            attribute vec2 aUV;
            varying vec2 vTextureCoord;
            uniform mat3 uProjectionMatrix;
            uniform mat3 uWorldTransformMatrix;
            uniform mat3 uTransformMatrix;

            void main() {
                vTextureCoord = (uTransformMatrix * vec3(aUV, 1.0)).xy;
                gl_Position = vec4((uProjectionMatrix * uWorldTransformMatrix * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
            }
        `,
      fragment: glitchShaderFrag,
    }),
    resources: {
      usb: {
        time: { value: 0.0, type: "f32" },
        resolution: { value: [app.screen.width, app.screen.height], type: "vec2<f32>" },
      },
    },
  });

  // Fallback for v7/Standard if the above is too complex for this rapid iteration
  // The error 'Cannot read properties of undefined (reading 'time')' usually means filter.uniforms is undefined
  // or the shader failed to compile so the uniforms were never mapped.

  // Let's use the simpler v8 compatible syntax if we are on v8:
  // v8 uses 'resources' instead of direct uniforms for some pipelines, but .uniforms getter should exist.

  // However, simpler fix for v7/v8 compatibility:
  const simpleFilter = new PIXI.Filter(undefined, glitchShaderFrag, {
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
