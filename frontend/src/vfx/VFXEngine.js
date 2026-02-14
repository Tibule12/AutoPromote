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
    backgroundAlpha: 1,
    resolution: 1, // Fix resolution to 1 to match video pixels exactly
    autoDensity: false, // Let CSS handle the UI scaling
    resizeTo: undefined, // DISABLE DOM resizing which causes the drift/crop issues
  });

  // Create Video Texture
  const texture = PIXI.Texture.from(videoElement);

  // Ensure valid texture dimensions before creating sprite
  if (!texture.valid) {
    console.log("WAITING FOR TEXTURE UPDATE...");
    await new Promise(resolve => {
      const timeout = setTimeout(() => {
        console.warn("Texture update timed out, forcing resolve");
        resolve();
      }, 2000); // 2s timeout

      texture.once("update", () => {
        clearTimeout(timeout);
        resolve();
      });

      // Failsafe if already updated
      if (texture.valid) {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  const sprite = new PIXI.Sprite(texture);

  // 2. Simple Layout: Fill the Stage
  // Since stage == video size, this maps 1:1 without complex math
  sprite.width = vWidth;
  sprite.height = vHeight;

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
