import { ShaderMaterial, Vector4 } from "three";

// One decoded video / GPU texture feeds every angle. Each screen crops in its
// shader rather than creating a separate video or uploading a canvas every frame.
export function footageMaterial(map, { aspect = 16 / 9, focusX = 0.5, zoom = 1 } = {}) {
  const width = Math.min(1, aspect / (16 / 9)) / zoom;
  const height = Math.min(1, (16 / 9) / aspect) / zoom;
  const left = Math.max(0, Math.min(1 - width, focusX - width / 2));
  const top = Math.max(0, Math.min(1 - height, 0.4 - height / 2));
  return new ShaderMaterial({
    transparent: true,
    uniforms: {
      map: { value: map },
      crop: { value: new Vector4(left, 1 - top - height, width, height) },
      reveal: { value: 1.04 },
      blur: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform vec4 crop;
      uniform float reveal;
      uniform float blur;
      varying vec2 vUv;
      vec3 decodeVideo(vec3 rgb) {
        return mix(pow((rgb + 0.055) / 1.055, vec3(2.4)), rgb / 12.92, step(rgb, vec3(0.04045)));
      }
      void main() {
        vec2 uv = crop.xy + vUv * crop.zw;
        vec3 rgb = texture2D(map, uv).rgb;
        if (blur > 0.001) {
          vec2 offset = vec2(blur * 0.018 * crop.z, 0.0);
          rgb = rgb * 0.6 + texture2D(map, uv - offset).rgb * 0.2 + texture2D(map, uv + offset).rgb * 0.2;
        }
        gl_FragColor = vec4(decodeVideo(rgb), smoothstep(0.0, 0.025, reveal - vUv.x));
        #include <colorspace_fragment>
      }
    `,
  });
}

// Live web matte, short directional blur and a timed light pass. This is a
// temporary real-time representation, not an authored After Effects asset.
export function revealMaterial(map) {
  return new ShaderMaterial({
    transparent: true,
    uniforms: {
      map: { value: map },
      reveal: { value: 1.04 },
      blur: { value: 0 },
      sweep: { value: -1 },
    },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D map;
      uniform float reveal;
      uniform float blur;
      uniform float sweep;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(map, vUv);
        if (blur > 0.001) {
          vec2 offset = vec2(blur * 0.018, 0.0);
          color *= 0.4;
          color += texture2D(map, vUv - offset) * 0.2;
          color += texture2D(map, vUv + offset) * 0.2;
          color += texture2D(map, vUv - offset * 2.0) * 0.1;
          color += texture2D(map, vUv + offset * 2.0) * 0.1;
        }
        color.a *= smoothstep(0.0, 0.025, reveal - vUv.x);
        if (color.a < 0.02) discard;
        float lightPass = max(0.0, 1.0 - abs(vUv.x - sweep) / 0.12);
        color.rgb *= 1.0 + lightPass * 0.3;
        gl_FragColor = color;
        #include <colorspace_fragment>
      }
    `,
  });
}
