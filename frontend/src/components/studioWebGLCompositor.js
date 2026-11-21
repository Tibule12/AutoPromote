import {REGION_SHADER,packRegionGeometry} from './studioRegionShader';
import {buildMaterialCube} from './studioMaterialQualifier';
import {buildAdvancedColorCube} from './studioColorCube';
import { computeColorScopesFromRgba } from "./studioColorScopes";

const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));

export const SHADER_BLEND_MODE_INDEX = Object.freeze({
  normal: 0,
  multiply: 1,
  screen: 2,
  difference: 3,
  overlay: 4,
  "soft-light": 5,
  "hard-light": 6,
  "color-dodge": 7,
  luminosity: 8,
});

export const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

export const GRADE_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler2D u_source;
uniform sampler3D u_lut3D;
uniform vec2 u_resolution;

uniform int u_hasGrade;
uniform float u_exposure;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_lift;
uniform float u_gamma;
uniform float u_gain;
uniform vec3 u_whiteBalance;

uniform int u_hasLut;
uniform float u_lutIntensity;
uniform vec3 u_lutDomainMin;
uniform vec3 u_lutDomainMax;

uniform float u_vignetteAmount;
uniform float u_vignetteAngle;

uniform int u_windowEnabled;
uniform vec2 u_windowCenter;
uniform vec2 u_windowRadius;
uniform float u_windowRotation;
uniform float u_windowFeather;
uniform int u_windowInvert;
uniform float u_windowExposure;
uniform float u_windowSaturation;
uniform float u_windowGain;

uniform int u_qualifierEnabled;
uniform float u_qualHueCenter;
uniform float u_qualHueWidth;
uniform float u_qualSatMin;
uniform float u_qualSatMax;
uniform float u_qualLumMin;
uniform float u_qualLumMax;
uniform float u_qualSoftness;
uniform int u_qualInvert;
uniform int u_qualShowMatte;
uniform float u_qualHueShift;
uniform float u_qualSaturation;
uniform float u_qualGain;

uniform float u_halation;
uniform float u_chromaticAberration;
uniform float u_grainAmount;
uniform float u_grainSeed;
uniform float u_dreamGlow;
uniform float u_anamorphicFlare;
uniform float u_lensBlur;

uniform int u_joinMode; // 0=none, 1=black, 2=white
uniform float u_joinOpacity;

${REGION_SHADER}

in vec2 v_texCoord;
out vec4 outColor;

vec3 rgbToHsl(vec3 c) {
  float maxC = max(c.r, max(c.g, c.b));
  float minC = min(c.r, min(c.g, c.b));
  float l = (maxC + minC) * 0.5;
  float s = 0.0;
  float h = 0.0;
  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / max(1e-5, 2.0 - maxC - minC) : d / max(1e-5, maxC + minC);
    if (maxC == c.r) h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    else if (maxC == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h /= 6.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 0.5) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hslToRgb(vec3 hsl) {
  if (hsl.y <= 1e-5) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0 / 3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0 / 3.0)
  );
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 applyPrimaryGrade(vec3 rgb) {
  vec3 lin = max(vec3(0.0), rgb * (u_exposure * u_brightness * u_gain) * u_whiteBalance + vec3(u_lift));
  vec3 curved = clamp((pow(lin, vec3(1.0 / max(0.001, u_gamma))) - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  float luma = dot(curved, vec3(0.2126, 0.7152, 0.0722));
  return clamp(vec3(luma) + (curved - vec3(luma)) * u_saturation, 0.0, 1.0);
}

float computePowerWindowMask(vec2 uv) {
  vec2 d = uv - u_windowCenter;
  float c = cos(u_windowRotation);
  float s = sin(u_windowRotation);
  vec2 rot = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
  vec2 norm = rot / max(vec2(0.005), u_windowRadius);
  float dist = length(norm);
  float feather = max(0.01, u_windowFeather);
  float mask = 1.0 - smoothstep(1.0 - feather, 1.0 + feather, dist);
  return u_windowInvert == 1 ? (1.0 - mask) : mask;
}

float computeQualifierMask(vec3 rgb) {
  vec3 hsl = rgbToHsl(rgb);
  float hueDist = abs(hsl.x - u_qualHueCenter);
  hueDist = min(hueDist, 1.0 - hueDist);
  float soft = max(0.01, u_qualSoftness);
  float hMask = 1.0 - smoothstep(u_qualHueWidth, u_qualHueWidth + soft * 0.5, hueDist);
  float sMask = smoothstep(u_qualSatMin - soft * 0.25, u_qualSatMin + soft * 0.25, hsl.y) *
                (1.0 - smoothstep(u_qualSatMax - soft * 0.25, u_qualSatMax + soft * 0.25, hsl.y));
  float lMask = smoothstep(u_qualLumMin - soft * 0.25, u_qualLumMin + soft * 0.25, hsl.z) *
                (1.0 - smoothstep(u_qualLumMax - soft * 0.25, u_qualLumMax + soft * 0.25, hsl.z));
  float mask = clamp(hMask * sMask * lMask, 0.0, 1.0);
  return u_qualInvert == 1 ? (1.0 - mask) : mask;
}

void main() {
  vec4 texel = texture(u_source, v_texCoord);
  vec3 color = texel.rgb;

  if (u_chromaticAberration > 0.0001) {
    vec2 dir = (v_texCoord - 0.5) * u_chromaticAberration * 0.012;
    color.r = texture(u_source, clamp(v_texCoord + dir, 0.0, 1.0)).r;
    color.b = texture(u_source, clamp(v_texCoord - dir, 0.0, 1.0)).b;
  }

  if (u_lensBlur > 0.0001) {
    float edgeMask = smoothstep(0.18, 0.92, length(v_texCoord - 0.5) * 1.45);
    vec2 blurPx = (vec2(1.0) / max(vec2(1.0), u_resolution)) * (u_lensBlur * 11.0 * edgeMask);
    vec2 innerPx = blurPx * 0.45;
    vec3 edgeBlur = (
      texture(u_source, clamp(v_texCoord + vec2(innerPx.x, 0.0), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord - vec2(innerPx.x, 0.0), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(0.0, innerPx.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord - vec2(0.0, innerPx.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(blurPx.x, 0.0), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord - vec2(blurPx.x, 0.0), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(0.0, blurPx.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord - vec2(0.0, blurPx.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(blurPx.x * 0.707, blurPx.y * 0.707), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(-blurPx.x * 0.707, blurPx.y * 0.707), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(blurPx.x * 0.707, -blurPx.y * 0.707), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(-blurPx.x * 0.707, -blurPx.y * 0.707), 0.0, 1.0)).rgb
    ) / 12.0;
    color = mix(color, edgeBlur, edgeMask * clamp(u_lensBlur, 0.0, 1.0));
  }

  if (u_joinOpacity > 0.0) {
    vec3 joinTarget = u_joinMode == 2 ? vec3(1.0) : vec3(0.0);
    color = mix(color, joinTarget, clamp(u_joinOpacity, 0.0, 1.0));
  }

  if (u_hasGrade == 1) {
    color = applyPrimaryGrade(color);
  }

  if (u_hasLut == 1 && u_lutIntensity > 0.0) {
    vec3 span = max(vec3(1e-5), u_lutDomainMax - u_lutDomainMin);
    vec3 uvw = clamp((color - u_lutDomainMin) / span, 0.0, 1.0);
    // LUT values live at grid vertices, represented by texture texel centres.
    // Direct 0..1 sampling stretches the endpoints and changes even identity.
    vec3 lutSize = vec3(textureSize(u_lut3D, 0));
    vec3 lutUv = (uvw * (lutSize - vec3(1.0)) + vec3(0.5)) / lutSize;
    vec3 lutRgb = texture(u_lut3D, lutUv).rgb;
    color = mix(color, lutRgb, clamp(u_lutIntensity, 0.0, 1.0));
  }

  if (u_windowEnabled == 1) {
    float wMask = computePowerWindowMask(v_texCoord);
    vec3 winColor = clamp(color * pow(2.0, u_windowExposure) * u_windowGain, 0.0, 1.0);
    float winLuma = dot(winColor, vec3(0.2126, 0.7152, 0.0722));
    winColor = clamp(vec3(winLuma) + (winColor - vec3(winLuma)) * u_windowSaturation, 0.0, 1.0);
    color = mix(color, winColor, wMask);
  }

  if (u_qualifierEnabled == 1) {
    float qMask = computeQualifierMask(color);
    if (u_qualShowMatte == 1) {
      color = vec3(qMask);
    } else {
      vec3 hsl = rgbToHsl(color);
      hsl.x = fract(hsl.x + u_qualHueShift);
      hsl.y = clamp(hsl.y * u_qualSaturation, 0.0, 1.0);
      vec3 qualRgb = clamp(hslToRgb(hsl) * u_qualGain, 0.0, 1.0);
      color = mix(color, qualRgb, qMask);
    }
  }

  if (u_halation > 0.001) {
    vec2 px1 = vec2(2.5) / max(vec2(1.0), u_resolution);
    vec2 px2 = vec2(6.0) / max(vec2(1.0), u_resolution);
    vec3 bloom = (
      texture(u_source, clamp(v_texCoord + vec2(px1.x, 0.0), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord - vec2(px1.x, 0.0), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(0.0, px1.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord - vec2(0.0, px1.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(px2.x, px2.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(-px2.x, px2.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(px2.x, -px2.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(-px2.x, -px2.y), 0.0, 1.0)).rgb
    ) * 0.125;
    float hi = smoothstep(0.65, 1.0, dot(bloom, vec3(0.2126, 0.7152, 0.0722)));
    color = clamp(color + vec3(1.0, 0.34, 0.12) * hi * u_halation * 0.48, 0.0, 1.0);
  }

  if (u_dreamGlow > 0.001) {
    vec2 d1 = vec2(3.5) / max(vec2(1.0), u_resolution);
    vec2 d2 = vec2(9.0) / max(vec2(1.0), u_resolution);
    vec3 mistSample = (
      texture(u_source, clamp(v_texCoord + vec2(d1.x, 0.0), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord - vec2(d1.x, 0.0), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(0.0, d1.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord - vec2(0.0, d1.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(d2.x, d2.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(-d2.x, d2.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(d2.x, -d2.y), 0.0, 1.0)).rgb +
      texture(u_source, clamp(v_texCoord + vec2(-d2.x, -d2.y), 0.0, 1.0)).rgb
    ) * 0.125;
    float mistHi = smoothstep(0.50, 0.98, dot(mistSample, vec3(0.2126, 0.7152, 0.0722)));
    vec3 veil = mistSample * mistHi * u_dreamGlow * 0.62;
    color = clamp(1.0 - (1.0 - color) * (1.0 - clamp(veil, 0.0, 0.92)), 0.0, 1.0);
  }

  if (u_anamorphicFlare > 0.001) {
    float invW = 1.0 / max(1.0, u_resolution.x);
    vec3 s1 = texture(u_source, clamp(v_texCoord + vec2(10.0 * invW, 0.0), 0.0, 1.0)).rgb +
              texture(u_source, clamp(v_texCoord - vec2(10.0 * invW, 0.0), 0.0, 1.0)).rgb;
    vec3 s2 = texture(u_source, clamp(v_texCoord + vec2(26.0 * invW, 0.0), 0.0, 1.0)).rgb +
              texture(u_source, clamp(v_texCoord - vec2(26.0 * invW, 0.0), 0.0, 1.0)).rgb;
    vec3 s3 = texture(u_source, clamp(v_texCoord + vec2(48.0 * invW, 0.0), 0.0, 1.0)).rgb +
              texture(u_source, clamp(v_texCoord - vec2(48.0 * invW, 0.0), 0.0, 1.0)).rgb;
    vec3 s4 = texture(u_source, clamp(v_texCoord + vec2(80.0 * invW, 0.0), 0.0, 1.0)).rgb +
              texture(u_source, clamp(v_texCoord - vec2(80.0 * invW, 0.0), 0.0, 1.0)).rgb;
    float streakEnergy = (
      smoothstep(0.72, 1.0, dot(s1 * 0.5, vec3(0.2126, 0.7152, 0.0722))) * 0.42 +
      smoothstep(0.72, 1.0, dot(s2 * 0.5, vec3(0.2126, 0.7152, 0.0722))) * 0.30 +
      smoothstep(0.72, 1.0, dot(s3 * 0.5, vec3(0.2126, 0.7152, 0.0722))) * 0.18 +
      smoothstep(0.72, 1.0, dot(s4 * 0.5, vec3(0.2126, 0.7152, 0.0722))) * 0.10
    );
    vec3 flare = vec3(0.32, 0.74, 1.0) * streakEnergy * u_anamorphicFlare * 0.72;
    color = clamp(1.0 - (1.0 - color) * (1.0 - clamp(flare, 0.0, 0.92)), 0.0, 1.0);
  }

  if (u_vignetteAmount > 0.005) {
    vec2 pixel = v_texCoord * u_resolution;
    vec2 halfRes = u_resolution * 0.5;
    float maxDist = length(halfRes);
    float radius = length(pixel - halfRes) / max(1.0, maxDist);
    float factor = radius > 1.0 ? 0.0 : pow(cos(u_vignetteAngle * radius), 4.0);
    // Match limited-range BT.709 YUV vignette offsets in studioPrecisionGrade.js
    vec3 offsets = vec3(
      (16.0 / 219.0) + 1.5748 * (1.0 / 224.0),
      (16.0 / 219.0) - (0.187324 + 0.468124) * (1.0 / 224.0),
      (16.0 / 219.0) + 1.8556 * (1.0 / 224.0)
    );
    color = clamp(color * factor + (factor - 1.0) * offsets, 0.0, 1.0);
  }

  if (u_grainAmount > 0.001) {
    float n = hash12(v_texCoord * u_resolution + vec2(u_grainSeed * 97.3, u_grainSeed * 41.7)) - 0.5;
    color = clamp(color + vec3(n * u_grainAmount * 0.16), 0.0, 1.0);
  }

  if(u_regionEnabled==1){
    if(u_regionHasRecolor==1)color=regionCube(u_regionRecolor,color);
    color=mix(texel.rgb,color,regionAlpha(v_texCoord,texel.rgb));
  }
  outColor = vec4(color, texel.a);
}
`;

export const COMPOSITE_FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform sampler2D u_base;
uniform sampler2D u_layer;
uniform int u_blendMode;
uniform float u_opacity;

in vec2 v_texCoord;
out vec4 outColor;

float lum(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 clipColor(vec3 c) {
  float l = lum(c);
  float n = min(c.r, min(c.g, c.b));
  float x = max(c.r, max(c.g, c.b));
  if (n < 0.0) c = l + ((c - l) * l) / max(1e-5, l - n);
  if (x > 1.0) c = l + ((c - l) * (1.0 - l)) / max(1e-5, x - l);
  return clamp(c, 0.0, 1.0);
}

vec3 setLum(vec3 c, float l) {
  return clipColor(c + (l - lum(c)));
}

vec3 blendChannel(vec3 b, vec3 s, int mode) {
  if (mode == 1) return b * s; // multiply
  if (mode == 2) return 1.0 - (1.0 - b) * (1.0 - s); // screen
  if (mode == 3) return abs(b - s); // difference
  if (mode == 4) { // overlay
    return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, b));
  }
  if (mode == 5) { // soft-light
    vec3 d = mix(sqrt(max(vec3(0.0), b)), ((16.0 * b - 12.0) * b + 4.0) * b, step(b, vec3(0.25)));
    return mix(b + (2.0 * s - 1.0) * (d - b), b - (1.0 - 2.0 * s) * b * (1.0 - b), step(s, vec3(0.5)));
  }
  if (mode == 6) { // hard-light
    return mix(2.0 * b * s, 1.0 - 2.0 * (1.0 - b) * (1.0 - s), step(0.5, s));
  }
  if (mode == 7) { // color-dodge
    return min(vec3(1.0), b / max(vec3(1e-4), 1.0 - s));
  }
  if (mode == 8) { // luminosity
    return setLum(b, lum(s));
  }
  return s; // normal
}

void main() {
  vec4 base = texture(u_base, v_texCoord);
  vec4 layer = texture(u_layer, v_texCoord);
  float alpha = clamp(layer.a * u_opacity, 0.0, 1.0);
  vec3 blended = blendChannel(base.rgb, layer.rgb, u_blendMode);
  outColor = vec4(mix(base.rgb, blended, alpha), max(base.a, alpha));
}
`;

export function compilePrecisionGradeUniforms(fx = {}) {
  const exposure = 2 ** clamp(fx.exposureStops ?? 0, -2, 2);
  const lift = clamp(fx.lift ?? 0, -0.15, 0.15);
  const gamma = clamp(fx.gamma ?? 1, 0.6, 1.6);
  const gain = clamp(fx.gain ?? 1, 0.6, 1.4);
  const warmth = clamp(fx.temperature ?? 0, -1, 1);
  const tint = clamp(fx.tint ?? 0, -1, 1);
  const contrast = clamp(fx.contrast ?? 1, 0.65, 1.75);
  const brightness = clamp(fx.brightness ?? 1, 0.65, 1.4);
  const saturation = clamp(fx.saturation ?? 1, 0, 1.8);
  const whiteBalance = [
    1 + warmth * 0.1 + tint * 0.04,
    1 - tint * 0.08,
    1 - warmth * 0.1 + tint * 0.04,
  ];
  const vignetteAmount = clamp(fx.vignette ?? 0, 0, 0.85);
  const vignetteAngle =
    vignetteAmount > 0.005
      ? Math.PI / Number(Math.max(5.5, 17 - vignetteAmount * 10).toFixed(3))
      : 0;
  return {
    exposure,
    lift,
    gamma,
    gain,
    contrast,
    brightness,
    saturation,
    whiteBalance,
    vignetteAmount,
    vignetteAngle,
  };
}

export function packColorCubeRgba8(cube) {
  if (!cube || !Number.isInteger(cube.size) || !Array.isArray(cube.data)) return null;
  const n = cube.size;
  const expected = n * n * n * 3;
  if (cube.data.length !== expected) return null;
  const rgba = new Uint8Array(n * n * n * 4);
  for (let i = 0, j = 0; i < expected; i += 3, j += 4) {
    rgba[j] = Math.round(clamp(cube.data[i], 0, 1) * 255);
    rgba[j + 1] = Math.round(clamp(cube.data[i + 1], 0, 1) * 255);
    rgba[j + 2] = Math.round(clamp(cube.data[i + 2], 0, 1) * 255);
    rgba[j + 3] = 255;
  }
  return { size: n, data: rgba };
}

export function isWebGL2CompositorSupported() {
  if (typeof document === "undefined") return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2"));
  } catch (_err) {
    return false;
  }
}

function compileProgram(gl, vsSource, fsSource) {
  const compile = (type, src) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`WebGL2 shader compile failed: ${info}`);
    }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGL2 program link failed: ${info}`);
  }
  return program;
}

export function createStudioWebGLCompositor(outputCanvas = null) {
  if (typeof document === "undefined") return null;
  const surface = outputCanvas || document.createElement("canvas");
  const gl = surface.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: "high-performance",
  });
  if (!gl) return null;
  let softwareRenderer = false;
  try {
    const debug = gl.getExtension?.('WEBGL_debug_renderer_info');
    const renderer = debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
    softwareRenderer = /SwiftShader|llvmpipe|softpipe|software rasterizer/i.test(String(renderer || ''));
  } catch (_) { /* Restricted renderer information keeps the normal GL path. */ }

  let gradeProgram;
  let compositeProgram;
  try {
    gradeProgram = compileProgram(gl, VERTEX_SHADER_SOURCE, GRADE_FRAGMENT_SHADER_SOURCE);
    compositeProgram = compileProgram(gl, VERTEX_SHADER_SOURCE, COMPOSITE_FRAGMENT_SHADER_SOURCE);
  } catch (_err) {
    return null;
  }

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 0, 1,
      1, -1, 1, 1,
      -1, 1, 0, 0,
      1, 1, 1, 0,
    ]),
    gl.STATIC_DRAW
  );

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const posLoc = gl.getAttribLocation(gradeProgram, "a_position");
  const texLoc = gl.getAttribLocation(gradeProgram, "a_texCoord");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(texLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 16, 8);
  gl.bindVertexArray(null);

  const sourceTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sourceTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const lutTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_3D, lutTex);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texImage3D(
    gl.TEXTURE_3D,
    0,
    gl.RGBA8,
    2,
    2,
    2,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array(2 * 2 * 2 * 4)
  );

  gl.activeTexture(gl.TEXTURE2);
  const regionGeometry=gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D,regionGeometry);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,66,9,0,gl.RGBA,gl.FLOAT,new Float32Array(66*9*4));
  const makeRegionCubeTexture=unit=>{
    gl.activeTexture(gl.TEXTURE0+unit);
    const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,texture);
    for(const field of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_3D,field,gl.LINEAR);
    for(const field of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_3D,field,gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,2,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(32));return texture;
  };
  const regionMaterial=makeRegionCubeTexture(3),regionRecolor=makeRegionCubeTexture(4);
  const materialCubes=new Map(),recolorCubes=new Map(),packedRegionCubes=new WeakMap();
  const uploadRegionCube=(unit,texture,spec,cache,build)=>{
    gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_3D,texture);
    if(!spec?.enabled)return false;
    const id=JSON.stringify(spec);let cube=cache.get(id);
    if(!cube){cube=build(spec);if(cache.size>=8)cache.delete(cache.keys().next().value);cache.set(id,cube);}
    let packed=packedRegionCubes.get(cube);if(!packed){packed=packColorCubeRgba8(cube);packedRegionCubes.set(cube,packed);}
    gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA8,packed.size,packed.size,packed.size,0,gl.RGBA,gl.UNSIGNED_BYTE,packed.data);return true;
  };
  let scopeCanvas = null;
  let scopeCtx = null;
  let cachedLutCube = null;
  let cachedLutData = null;
  let cachedLutDomainKey = "";
  let cachedLutDomain = { min: [0, 0, 0], max: [1, 1, 1] };
  let disposed = false;

  const uploadColorCube = cube => {
    if (disposed || !cube) return false;
    // Canonical colour cubes are immutable. Distinct cubes can share their
    // dimensions and endpoints while changing every interior colour.
    const domainKey = JSON.stringify([cube.size, cube.domainMin, cube.domainMax]);
    if (cube === cachedLutCube && cube.data === cachedLutData && domainKey === cachedLutDomainKey) return true;
    const packed = packColorCubeRgba8(cube);
    if (!packed) return false;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, lutTex);
    gl.texImage3D(
      gl.TEXTURE_3D,
      0,
      gl.RGBA8,
      packed.size,
      packed.size,
      packed.size,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      packed.data
    );
    cachedLutCube = cube;
    cachedLutData = cube.data;
    cachedLutDomainKey = domainKey;
    cachedLutDomain = {
      min: Array.isArray(cube.domainMin) && cube.domainMin.length === 3 ? cube.domainMin : [0, 0, 0],
      max: Array.isArray(cube.domainMax) && cube.domainMax.length === 3 ? cube.domainMax : [1, 1, 1],
    };
    return true;
  };

  const renderGradedFrame = ({
    source,
    width,
    height,
    grade = null,
    cube = null,
    lutIntensity = 1,
    vignetteAmount = 0,
    powerWindow = null,
    qualifier = null,
    textureEffects = null,
    joinFade = null,
    selectiveMask = null,
    selectiveTime = 0,
    recolor = null,
  }) => {
    if (disposed || !source || !width || !height) return false;
    if (surface.width !== width) surface.width = width;
    if (surface.height !== height) surface.height = height;

    gl.viewport(0, 0, width, height);
    gl.useProgram(gradeProgram);
    gl.bindVertexArray(vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(gl.getUniformLocation(gradeProgram, "u_source"), 0);

    const hasLut = Boolean(cube && uploadColorCube(cube));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, lutTex);
    gl.uniform1i(gl.getUniformLocation(gradeProgram, "u_lut3D"), 1);
    gl.uniform1i(gl.getUniformLocation(gradeProgram, "u_hasLut"), hasLut ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_lutIntensity"), clamp(lutIntensity, 0, 1));
    gl.uniform3fv(gl.getUniformLocation(gradeProgram, "u_lutDomainMin"), cachedLutDomain.min);
    gl.uniform3fv(gl.getUniformLocation(gradeProgram, "u_lutDomainMax"), cachedLutDomain.max);

    gl.uniform2f(gl.getUniformLocation(gradeProgram, "u_resolution"), width, height);

    const uniforms = compilePrecisionGradeUniforms({
      ...(grade || {}),
      vignette: vignetteAmount || grade?.vignette || 0,
    });
    gl.uniform1i(gl.getUniformLocation(gradeProgram, "u_hasGrade"), grade ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_exposure"), uniforms.exposure);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_brightness"), uniforms.brightness);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_contrast"), uniforms.contrast);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_saturation"), uniforms.saturation);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_lift"), uniforms.lift);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_gamma"), uniforms.gamma);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_gain"), uniforms.gain);
    gl.uniform3fv(gl.getUniformLocation(gradeProgram, "u_whiteBalance"), uniforms.whiteBalance);

    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_vignetteAmount"), uniforms.vignetteAmount);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_vignetteAngle"), uniforms.vignetteAngle);

    const win = powerWindow && powerWindow.enabled ? powerWindow : null;
    gl.uniform1i(gl.getUniformLocation(gradeProgram, "u_windowEnabled"), win ? 1 : 0);
    gl.uniform2f(gl.getUniformLocation(gradeProgram, "u_windowCenter"), clamp(win?.x ?? 0.5, 0, 1), clamp(win?.y ?? 0.5, 0, 1));
    gl.uniform2f(gl.getUniformLocation(gradeProgram, "u_windowRadius"), clamp(win?.rx ?? 0.25, 0.02, 1), clamp(win?.ry ?? 0.25, 0.02, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_windowRotation"), Number(win?.rotation || 0));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_windowFeather"), clamp(win?.feather ?? 0.25, 0.01, 1));
    gl.uniform1i(gl.getUniformLocation(gradeProgram, "u_windowInvert"), win?.invert ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_windowExposure"), clamp(win?.exposureStops ?? 0, -2, 2));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_windowSaturation"), clamp(win?.saturation ?? 1, 0, 2));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_windowGain"), clamp(win?.gain ?? 1, 0.4, 2));

    const qual = qualifier && qualifier.enabled ? qualifier : null;
    gl.uniform1i(gl.getUniformLocation(gradeProgram, "u_qualifierEnabled"), qual ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_qualHueCenter"), clamp(qual?.hueCenter ?? 0.08, 0, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_qualHueWidth"), clamp(qual?.hueWidth ?? 0.08, 0.01, 0.5));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_qualSatMin"), clamp(qual?.satMin ?? 0.15, 0, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_qualSatMax"), clamp(qual?.satMax ?? 1.0, 0, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_qualLumMin"), clamp(qual?.lumMin ?? 0.08, 0, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_qualLumMax"), clamp(qual?.lumMax ?? 0.95, 0, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_qualSoftness"), clamp(qual?.softness ?? 0.2, 0.01, 1));
    gl.uniform1i(gl.getUniformLocation(gradeProgram, "u_qualInvert"), qual?.invert ? 1 : 0);
    gl.uniform1i(gl.getUniformLocation(gradeProgram, "u_qualShowMatte"), qual?.showMatte ? 1 : 0);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_qualHueShift"), clamp(qual?.hueShift ?? 0, -0.5, 0.5));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_qualSaturation"), clamp(qual?.saturation ?? 1, 0, 2));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_qualGain"), clamp(qual?.gain ?? 1, 0.4, 2));

    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_halation"), clamp(textureEffects?.halation ?? 0, 0, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_chromaticAberration"), clamp(textureEffects?.chromaticAberration ?? 0, 0, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_grainAmount"), clamp(textureEffects?.filmGrain ?? 0, 0, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_grainSeed"), Number(textureEffects?.seed || 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_dreamGlow"), clamp(textureEffects?.dreamGlow ?? 0, 0, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_anamorphicFlare"), clamp(textureEffects?.anamorphicFlare ?? 0, 0, 1));
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_lensBlur"), clamp(textureEffects?.lensBlur ?? 0, 0, 1));

    const joinOpacity = clamp(joinFade?.opacity ?? 0, 0, 1);
    const joinMode = joinOpacity <= 0 ? 0 : joinFade?.mode === "energy_flash" ? 2 : 1;
    gl.uniform1i(gl.getUniformLocation(gradeProgram, "u_joinMode"), joinMode);
    gl.uniform1f(gl.getUniformLocation(gradeProgram, "u_joinOpacity"), joinOpacity);

    gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionEnabled'),selectiveMask?1:0);
    if(selectiveMask){
      const geometry=packRegionGeometry(selectiveMask,width,height,selectiveTime);
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,regionGeometry);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,66,9,0,gl.RGBA,gl.FLOAT,geometry.data);
      gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionGeometry'),2);
      gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionCount'),geometry.count);
      gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionInvert'),geometry.inverted?1:0);
      gl.uniform1f(gl.getUniformLocation(gradeProgram,'u_regionOpacity'),geometry.opacity);
      const material=uploadRegionCube(3,regionMaterial,selectiveMask.material,materialCubes,buildMaterialCube);
      const colorize=uploadRegionCube(4,regionRecolor,recolor,recolorCubes,spec=>buildAdvancedColorCube({recolor:spec}));
      gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionMaterial'),3);
      gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionRecolor'),4);
      gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionHasMaterial'),material?1:0);
      gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionHasRecolor'),colorize?1:0);
    }else{
      // Bind distinct texture units even when the feature is inactive: sampler
      // type conflicts invalidate an otherwise unrelated legacy grade draw.
      gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionGeometry'),2);
      gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionMaterial'),3);
      gl.uniform1i(gl.getUniformLocation(gradeProgram,'u_regionRecolor'),4);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    return true;
  };

  const sampleScopes = ({ width = 64, height = 36, columns = 32, bins = 24, vectorBins = 24 } = {}) => {
    if (disposed || !surface.width || !surface.height) return null;
    if (!scopeCanvas) {
      scopeCanvas = document.createElement("canvas");
      scopeCtx = scopeCanvas.getContext("2d", { willReadFrequently: true });
    }
    if (!scopeCtx) return null;
    if (scopeCanvas.width !== width) scopeCanvas.width = width;
    if (scopeCanvas.height !== height) scopeCanvas.height = height;
    scopeCtx.drawImage(surface, 0, 0, width, height);
    const imageData = scopeCtx.getImageData(0, 0, width, height);
    return computeColorScopesFromRgba(imageData.data, width, height, { columns, bins, vectorBins });
  };

  let readbackPixels=null,readbackImage=null;
  const copyGradedFrame = context => {
    const width=surface.width,height=surface.height;
    if(disposed||!width||!height)return false;
    if(!softwareRenderer){context.drawImage(surface,0,0,width,height);return true;}
    // Software GL already stores pixels on the CPU. Crossing the browser's
    // GPU canvas bridge for drawImage can stall every masked-grade copy.
    // Read the same shader output directly and invert GL's bottom-up rows.
    if(!readbackImage||readbackImage.width!==width||readbackImage.height!==height){
      readbackPixels=new Uint8Array(width*height*4);readbackImage=context.createImageData(width,height);
    }
    gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,readbackPixels);
    const stride=width*4;
    for(let y=0;y<height;y++)readbackImage.data.set(readbackPixels.subarray((height-1-y)*stride,(height-y)*stride),y*stride);
    context.putImageData(readbackImage,0,0);return true;
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    gl.deleteTexture(sourceTex);
    gl.deleteTexture(lutTex);
    gl.deleteTexture(regionGeometry);gl.deleteTexture(regionMaterial);gl.deleteTexture(regionRecolor);
    gl.deleteBuffer(quadBuffer);
    gl.deleteVertexArray(vao);
    gl.deleteProgram(gradeProgram);
    gl.deleteProgram(compositeProgram);
  };

  return {
    surface,
    gl,
    softwareRenderer,
    uploadColorCube,
    renderGradedFrame,
    copyGradedFrame,
    sampleScopes,
    dispose,
  };
}
