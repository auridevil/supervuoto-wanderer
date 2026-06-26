import * as THREE from "three";

// A lo-fi look: chunky pixelation, ordered-ish dithered color quantization,
// film grain, gentle desaturation and a soft vignette.
export const LofiShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: new THREE.Vector2(1, 1) },
    time: { value: 0 },
    pixelSize: { value: 2.0 },
    levels: { value: 26.0 },
    amount: { value: 0.55 },
    grain: { value: 1.0 }, // film-grain strength multiplier (main.js exposes a slider)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float time, pixelSize, levels, amount, grain;
    varying vec2 vUv;

    // Interleaved gradient noise -> cheap ordered dither, no arrays.
    float ign(vec2 p) {
      return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
    }
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 px = pixelSize / resolution;
      vec2 uv = (floor(vUv / px) + 0.5) * px;          // pixelate
      vec3 col = texture2D(tDiffuse, uv).rgb;

      // dithered posterize
      float d = (ign(gl_FragCoord.xy / pixelSize) - 0.5) / levels;
      col = floor((col + d) * levels + 0.5) / levels;

      // slight desaturation toward a muted lo-fi palette
      float g = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(g), 0.08);

      // film grain
      col += (hash(uv * resolution + time) - 0.5) * 0.025 * grain;

      // vignette
      float vig = smoothstep(1.05, 0.35, length(vUv - 0.5));
      col *= mix(0.82, 1.0, vig);

      gl_FragColor = vec4(mix(texture2D(tDiffuse, vUv).rgb, col, amount), 1.0);
    }
  `,
};
