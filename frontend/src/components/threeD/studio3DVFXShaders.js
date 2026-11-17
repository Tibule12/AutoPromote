import * as THREE from "three";

/**
 * Custom low-key cinema HDRI environment with crisp studio light-strips over
 * pitch black. Replaces bright office RoomEnvironment so brushed chrome, gold,
 * and obsidian titanium show razor-sharp anisotropic highlights.
 */
export function createDarkCinemaStudioEnv(renderer, primaryColor = "#a855f7", glowColor = "#00e5ff") {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color("#020206");

  const stripGeo = new THREE.PlaneGeometry(1, 1);
  const addStrip = (color, intensity, pos, rot, scale) => {
    const col = new THREE.Color(color).multiplyScalar(intensity);
    const mat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(stripGeo, mat);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.scale.set(...scale);
    envScene.add(mesh);
  };

  // Overhead crisp white softbox strip
  addStrip("#ffffff", 7.5, [0, 12, 3], [Math.PI / 2, 0, 0], [18, 2.2, 1]);
  // Broad brushed-metal front softbox reflectors so planar wordmarks & monograms gleam luxury gold/chrome
  addStrip("#fffdf7", 2.8, [0, 6.0, 13.0], [0.42, 0, 0], [16, 4.5, 1]);
  addStrip("#e2e8f0", 1.7, [0, -3.5, 13.0], [-0.26, 0, 0], [12, 2.5, 1]);
  addStrip("#fffaf2", 3.8, [-5.5, 2.8, 11.5], [0.18, -0.36, 0], [1.8, 9.5, 1]);
  addStrip("#e8f4ff", 3.6, [5.5, 3.4, 11.5], [0.22, 0.36, 0], [1.8, 9.5, 1]);
  // High left key rim strip (cool daylight)
  addStrip("#e0f2fe", 5.5, [-11, 5.5, 7], [0, Math.PI / 3, 0], [3.2, 12, 1]);
  // Right brand accent rim strip
  addStrip(glowColor, 5.8, [12, 2.5, 4], [0, -Math.PI / 2.4, 0], [2.8, 11, 1]);
  // Upper-back primary silhouette rim
  addStrip(primaryColor, 5.2, [0, 6.5, -10], [0.35, 0, 0], [16, 2.5, 1]);
  // Subtle low floor kick strip
  addStrip("#cbd5e1", 2.1, [0, -8, 8], [-Math.PI / 2.4, 0, 0], [14, 1.8, 1]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(envScene, 0.02);
  stripGeo.dispose();
  envScene.traverse(obj => {
    if (obj.material) obj.material.dispose();
  });
  pmrem.dispose();
  return envTarget;
}

/**
 * Full-screen animated GLSL domain-warped volumetric plasma/silk backdrop.
 * Produces rich atmospheric ribbons and god-ray haze behind 3D hero locks.
 */
export function createVolumetricBackdropMaterial(primaryColor = "#a855f7", glowColor = "#00e5ff", style = "silk") {
  const modeVal = style === "forge" ? 1.0 : style === "monolith" ? 2.0 : style === "cyber" ? 3.0 : 0.0;
  return new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: false,
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 1 },
      uPrimary: { value: new THREE.Color(primaryColor) },
      uGlow: { value: new THREE.Color(glowColor) },
      uMode: { value: modeVal },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.9999, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uPrimary;
      uniform vec3 uGlow;
      uniform float uMode;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p = rot * p * 2.04 + vec2(1.7, 9.2);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        p.x *= 1.7778;
        float t = uTime * 0.28;

        // Volumetric god-rays from high center
        float angle = atan(p.y - 1.35, p.x);
        float rays = pow(0.5 + 0.5 * sin(angle * 11.0 + t * 1.4), 3.0) * smoothstep(2.4, 0.0, length(p - vec2(0.0, 0.35)));
        rays *= smoothstep(-0.85, 0.9, p.y);

        // Domain-warped fluid plasma silk
        vec2 q = vec2(fbm(p * 1.15 + vec2(t * 0.4, -t * 0.25)), fbm(p * 1.25 + vec2(-t * 0.3, t * 0.35)));
        vec2 r = vec2(fbm(p * 1.55 + 2.2 * q + vec2(t * 0.2)), fbm(p * 1.65 + 2.1 * q - vec2(t * 0.25)));
        float f = fbm(p * 1.35 + 1.8 * r);

        float halo = exp(-dot(p * vec2(0.58, 0.95), p * vec2(0.58, 0.95)) * 1.35);
        float ribbon = smoothstep(0.28, 0.82, f) * halo;

        vec3 base = vec3(0.012, 0.011, 0.026);
        vec3 col = base;
        if (uMode > 0.5 && uMode < 1.5) {
          // Forge: deep charcoal soot with smoldering primary & subtle cyan upper rim
          col += uPrimary * (ribbon * 0.36 + rays * 0.14);
          col += uGlow * pow(ribbon, 2.2) * 0.22;
        } else if (uMode > 1.5 && uMode < 2.5) {
          // Monolith: cool architectural slate shafts
          col += mix(uGlow, uPrimary, 0.4) * (rays * 0.26 + ribbon * 0.18);
        } else if (uMode > 2.5) {
          // Cyber: deep ultraviolet scan mist + cyan aurora
          col += uPrimary * ribbon * 0.34 + uGlow * (rays * 0.2 + pow(f, 3.0) * halo * 0.28);
        } else {
          // Liquid silk: smooth iridescent gradient waves
          col += mix(uPrimary, uGlow, clamp(r.x, 0.0, 1.0)) * (ribbon * 0.42 + rays * 0.16);
        }

        // Horizon atmospheric mist line + vignette corners
        float horizonGlow = exp(-pow((vUv.y - 0.22) * 6.5, 2.0)) * (0.14 + 0.12 * q.x);
        col += mix(uPrimary, uGlow, 0.55) * horizonGlow * smoothstep(2.1, 0.0, abs(p.x));
        float vig = smoothstep(2.4, 0.55, length(p * vec2(0.75, 1.0)));
        gl_FragColor = vec4(col * (0.45 + 0.55 * vig) * uIntensity, 1.0);
      }
    `,
  });
}

/**
 * Custom GLSL architectural slate arena floor shader: concentric etched rings,
 * micro perspective grid, and soft radial horizon falloff.
 */
export function createArenaFloorMaterial(primaryColor = "#a855f7", glowColor = "#00e5ff") {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uPrimary: { value: new THREE.Color(primaryColor) },
      uGlow: { value: new THREE.Color(glowColor) },
    },
    vertexShader: /* glsl */`
      varying vec3 vWorldPos;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorldPos = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform float uPulse;
      uniform vec3 uPrimary;
      uniform vec3 uGlow;
      varying vec3 vWorldPos;

      void main() {
        vec2 p = vWorldPos.xz;
        float dist = length(p);

        // Crisp architectural micro-grid with screen-space derivative AA
        vec2 gridCoord = p * 1.15;
        vec2 gridDeriv = fwidth(gridCoord);
        vec2 gridDist = abs(fract(gridCoord - 0.5) - 0.5) / max(gridDeriv, vec2(0.001));
        float gridLine = 1.0 - min(min(gridDist.x, gridDist.y), 1.0);

        // Concentric radar / pedestal rings
        float ringCoord = dist * 0.85;
        float ringDeriv = fwidth(ringCoord);
        float ringDist = abs(fract(ringCoord - 0.5) - 0.5) / max(ringDeriv, 0.001);
        float ringLine = (1.0 - min(ringDist, 1.0)) * smoothstep(7.5, 1.2, dist);

        // Traveling shockwave highlight ring (suppressed inside r<0.45 so no center white blowout)
        float waveRadius = uPulse * 10.5;
        float wave = exp(-pow((dist - waveRadius) * 3.8, 2.0)) * smoothstep(1.0, 0.2, uPulse) * step(0.01, uPulse) * smoothstep(0.45, 1.8, waveRadius);

        float arenaFade = exp(-dist * 0.25) * smoothstep(11.8, 1.6, dist);
        vec3 baseVeil = vec3(0.002, 0.002, 0.006);
        vec3 lineColor = mix(uPrimary, uGlow, 0.5 + 0.5 * sin(dist * 0.7 - uTime * 1.5));

        vec3 col = baseVeil;
        col += lineColor * (gridLine * 0.15 + ringLine * 0.34) * arenaFade;
        col += uGlow * wave * 0.45 * smoothstep(11.5, 1.8, dist);

        // Translucent center over Reflector (r<6.4), opaque mask across r=[5.2..6.6], then dissolves to 0 sky
        float centerMask = mix(0.84, 1.0, smoothstep(1.2, 5.2, dist));
        float outerDissolve = smoothstep(13.8, 6.6, dist);
        float alpha = clamp((centerMask - wave * 0.12) * outerDissolve, 0.0, 1.0);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
}

/**
 * GPU curl-vortex swarm + magnetic convergence spark system (`count` points).
 * Computes helical trajectories and HDR spark falloff purely in GLSL.
 */
export function createVortexParticleSystem(count = 2200, primaryColor = "#f59e0b", glowColor = "#00e5ff") {
  const positions = new Float32Array(count * 3);
  const targets = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4); // [phase, radius, speed, hueMix]

  for (let i = 0; i < count; i += 1) {
    const u = ((i * 0.61803398875) % 1) * Math.PI * 2;
    const v = (((i * 0.38196601125) % 1) - 0.5) * 2;
    const r = 4.2 + ((i * 17) % 100) * 0.065;
    positions[i * 3] = Math.cos(u) * r;
    positions[i * 3 + 1] = v * 3.8 + 0.3;
    positions[i * 3 + 2] = Math.sin(u) * r;

    // Distribute convergence anchors across crest & wordmark bounds
    const isCrest = i % 3 !== 0;
    if (isCrest) {
      const a = (i * 2.39996) % (Math.PI * 2);
      const rad = 0.25 + ((i * 29) % 100) * 0.011;
      targets[i * 3] = Math.cos(a) * rad * 1.35;
      targets[i * 3 + 1] = 0.72 + Math.sin(a) * rad * 0.95;
      targets[i * 3 + 2] = (((i * 13) % 100) / 100 - 0.5) * 0.38;
    } else {
      targets[i * 3] = ((((i * 31) % 100) / 100) - 0.5) * 6.2;
      targets[i * 3 + 1] = -0.92 + ((((i * 19) % 100) / 100) - 0.5) * 0.68;
      targets[i * 3 + 2] = (((i * 11) % 100) / 100 - 0.5) * 0.32;
    }

    seeds[i * 4] = u;
    seeds[i * 4 + 1] = 0.55 + ((i * 47) % 100) * 0.014;
    seeds[i * 4 + 2] = 0.7 + ((i * 53) % 100) * 0.012;
    seeds[i * 4 + 3] = ((i * 37) % 100) / 100;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aTarget", new THREE.BufferAttribute(targets, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uConverge: { value: 0 }, // 0 = storm vortex, 1 = magnetically docked + released embers
      uShock: { value: 0 },    // 0 -> 1 post-impact outward scatter
      uPixelRatio: { value: 1 },
      uPrimary: { value: new THREE.Color(primaryColor) },
      uGlow: { value: new THREE.Color(glowColor) },
    },
    vertexShader: /* glsl */`
      attribute vec3 aTarget;
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uConverge;
      uniform float uShock;
      uniform float uPixelRatio;
      varying float vMix;
      varying float vAlpha;

      void main() {
        float phase = aSeed.x;
        float sizeMul = aSeed.y;
        float speed = aSeed.z;
        vMix = aSeed.w;

        // Helical storm spin slowing down into tight magnetic pull
        float spinAngle = phase + uTime * speed * mix(2.2, 0.32, uConverge);
        float radius = mix(length(position.xz), 0.35, smoothstep(0.0, 0.9, uConverge));
        vec3 vortexPos = vec3(
          cos(spinAngle) * radius,
          position.y * (1.0 - 0.75 * uConverge) + sin(uTime * 1.8 + phase) * 0.28,
          sin(spinAngle) * radius * 0.72
        );

        vec3 basePos = mix(vortexPos, aTarget, smoothstep(0.15, 0.95, uConverge));

        // Outward ember scatter wave after lock impact
        vec3 burstDir = normalize(aTarget - vec3(0.0, 0.2, -0.4) + vec3(0.001));
        float radialDrift = smoothstep(0.0, 1.0, uShock) * (1.8 + sizeMul * 2.4);
        vec3 finalPos = basePos + burstDir * radialDrift * step(0.42, vMix);
        finalPos.y += sin(uTime * 0.9 + phase) * 0.14 * uShock;

        vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float baseSize = mix(15.0, 8.0, uShock) * sizeMul;
        gl_PointSize = clamp(baseSize * uPixelRatio / max(1.0, -mvPosition.z), 1.2, 16.0);
        vAlpha = smoothstep(0.0, 0.12, uTime) * mix(0.95, 0.58, uShock * step(0.42, vMix));
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uPrimary;
      uniform vec3 uGlow;
      varying float vMix;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float d = length(uv);
        if (d > 1.0) discard;
        float core = exp(-d * d * 11.0);
        float halo = pow(max(0.0, 1.0 - d), 4.2);
        vec3 tint = mix(uPrimary, uGlow, vMix);
        vec3 col = mix(tint, vec3(1.0), core * 0.78) * (core * 2.4 + halo * 0.9);
        gl_FragColor = vec4(col, (core + halo * 0.55) * vAlpha);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/**
 * Final cinema post-processing composite shader: optical chromatic aberration
 * impulse, subtle anamorphic edge vignette, and fine film grain (eliminates banding).
 */
export const CinemaPostShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uChromatic: { value: 0.0006 },
    uVignette: { value: 0.34 },
    uGrain: { value: 0.022 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uChromatic;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;

    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233)) + uTime * 13.37) * 43758.5453);
    }

    void main() {
      vec2 dir = vUv - 0.5;
      float dist = length(dir);
      vec2 offset = dir * (uChromatic * (0.35 + dist * 2.1));

      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      vec3 col = vec3(r, g, b);

      float vig = smoothstep(0.95, 0.28, dist);
      col *= mix(1.0, vig, uVignette);
      col += (rand(vUv * 1280.0) - 0.5) * uGrain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};
