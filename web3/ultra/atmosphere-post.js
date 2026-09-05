import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const QUALITY = {
  high: { scale: .5, steps: 24, samples: 4, bloomScale: 1 },
  balanced: { scale: .45, steps: 16, samples: 2, bloomScale: .75 },
  low: { scale: .35, steps: 8, samples: 0, bloomScale: .5 },
};
const vertexShader = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Integrate only the segment between the camera, the courtyard volume and
// the first opaque surface. RGB is in-scattered HDR light; A is transmittance.
const volumeShader = /* glsl */`
#include <packing>
varying vec2 vUv;
uniform sampler2D sceneDepth;
uniform sampler2D sunDepth;
uniform mat4 inverseProjection;
uniform mat4 cameraWorld;
uniform mat4 sunMatrix;
uniform vec3 eye;
uniform vec3 sunDirection;
uniform vec3 sunColor;
uniform vec2 sunTexel;
uniform float hasSunShadow;
uniform float sunBias;
uniform float density;
uniform float time;
uniform vec3 pointPosition[2];
uniform vec3 pointColor[2];
uniform vec2 pointRange;

float hash(vec3 p) {
  p = fract(p * .3183099 + vec3(.11, .23, .37));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                 mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                 mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
vec3 worldAt(vec2 uv, float depth) {
  vec4 p = inverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return (cameraWorld * vec4(p.xyz / p.w, 1.0)).xyz;
}
vec2 volumeInterval(vec3 origin, vec3 direction) {
  // Preserve the sign for near-parallel rays without a division by zero.
  vec3 safeDirection = mix(vec3(-1.0), vec3(1.0), step(vec3(0.0), direction)) * max(abs(direction), vec3(.00001));
  vec3 a = (vec3(-14.0, .12, -12.0) - origin) / safeDirection;
  vec3 b = (vec3(14.0, 12.0, 12.0) - origin) / safeDirection;
  vec3 nearSide = min(a, b), farSide = max(a, b);
  return vec2(max(max(nearSide.x, nearSide.y), nearSide.z), min(min(farSide.x, farSide.y), farSide.z));
}
float shadowCompare(vec2 uv, float depth) {
  // The shadow target has no mip chain. Explicit LOD also avoids implicit
  // derivatives in the ray march's position-dependent shadow branch.
  return step(depth, unpackRGBAToDepth(textureLod(sunDepth, uv, 0.0)));
}
float sunlight(vec3 p) {
  // Lower-quality mode has no scene shadow map; avoid unoccluded bright shafts.
  if (hasSunShadow < .5) return .24;
  vec4 projected = sunMatrix * vec4(p, 1.0);
  vec3 uvz = projected.xyz / projected.w;
  if (any(lessThan(uvz, vec3(0.0))) || any(greaterThan(uvz, vec3(1.0)))) return .24;
  float depth = uvz.z + sunBias;
  vec2 t = sunTexel * 1.5;
  float visibility = shadowCompare(uvz.xy + t * vec2(-.5, -.5), depth)
                   + shadowCompare(uvz.xy + t * vec2(.5, -.5), depth)
                   + shadowCompare(uvz.xy + t * vec2(-.5, .5), depth)
                   + shadowCompare(uvz.xy + t * vec2(.5, .5), depth);
  return visibility * .25;
}
float fogAt(vec3 p) {
  vec3 drift = vec3(time * .024, 0.0, -time * .015);
  float n = noise3(p * vec3(.31, .24, .31) + drift);
  n = n * .7 + noise3(p * .73 - drift * .65) * .3;
  float ground = exp(-max(p.y - .25, 0.0) * .22);
  float edge = smoothstep(0.0, 2.5, 14.0 - abs(p.x)) * smoothstep(0.0, 2.5, 12.0 - abs(p.z));
  edge *= 1.0 - smoothstep(8.0, 12.0, p.y);
  return density * .019 * ground * (.48 + n * 1.05) * edge;
}
void main() {
  float depth = texture2D(sceneDepth, vUv).x;
  vec3 endpoint = worldAt(vUv, min(depth, .999999));
  vec3 ray = endpoint - eye;
  float surfaceDistance = length(ray);
  vec3 direction = ray / max(surfaceDistance, .0001);
  vec2 interval = volumeInterval(eye, direction);
  float start = max(interval.x, .1);
  float end = min(min(interval.y, surfaceDistance), 90.0);
  if (end <= start) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float stride = (end - start) / float(FOG_STEPS);
  // Screen-stable stratification avoids animated grain without temporal history.
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))));
  float transmission = 1.0;
  vec3 scattered = vec3(0.0);
  float mu = dot(direction, sunDirection);
  float phase = .8775 / pow(max(.2, 1.1225 - .7 * mu), 1.5);
  for (int i = 0; i < FOG_STEPS; i++) {
    vec3 p = eye + direction * (start + (float(i) + jitter) * stride);
    float opticalDepth = fogAt(p) * stride;
    float segmentTransmission = exp(-opticalDepth);
    vec3 illumination = vec3(.105, .135, .119);
    illumination += sunColor * sunlight(p) * (.32 + phase * .32);
    for (int j = 0; j < 2; j++) {
      float distanceToLight = length(pointPosition[j] - p);
      float reach = pointRange[j];
      float falloff = pow(clamp(1.0 - pow(distanceToLight / max(reach, .01), 4.0), 0.0, 1.0), 2.0);
      illumination += pointColor[j] * falloff / (1.0 + distanceToLight * distanceToLight);
    }
    scattered += transmission * (1.0 - segmentTransmission) * illumination;
    transmission *= segmentTransmission;
  }
  gl_FragColor = vec4(scattered, transmission);
}
`;

const compositeShader = /* glsl */`
#include <packing>
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform sampler2D sceneDepth;
uniform sampler2D fogTexture;
uniform vec2 fogSize;
uniform vec2 cameraRange;
float eyeDepth(vec2 uv) {
  return -perspectiveDepthToViewZ(texture2D(sceneDepth, uv).r, cameraRange.x, cameraRange.y);
}
void main() {
  vec4 source = texture2D(tDiffuse, vUv);
  float centerDepth = eyeDepth(vUv);
  vec2 pixel = vUv * fogSize - .5;
  vec2 base = floor(pixel), blend = fract(pixel);
  vec4 volume = vec4(0.0);
  float total = 0.0;
  // Match low-resolution fog samples to full-resolution depth so silhouettes
  // do not acquire the haze from a distant wall or the background beside them.
  for (int y = 0; y < 2; y++) {
    for (int x = 0; x < 2; x++) {
      vec2 offset = vec2(float(x), float(y));
      vec2 uv = clamp((base + offset + .5) / fogSize, .5 / fogSize, 1.0 - .5 / fogSize);
      vec2 bilinear = mix(1.0 - blend, blend, offset);
      float weight = bilinear.x * bilinear.y;
      weight *= exp(-abs(eyeDepth(uv) - centerDepth) / max(.18, centerDepth * .012));
      volume += texture2D(fogTexture, uv) * weight;
      total += weight;
    }
  }
  if (total < .0001) {
    // Thin foreground geometry can have no matching low-resolution sample.
    // Preserve it instead of pulling background haze across its silhouette.
    volume = vec4(0.0, 0.0, 0.0, 1.0);
  } else volume /= total;
  gl_FragColor = vec4(source.rgb * volume.a + volume.rgb, source.a);
}
`;

class CourtyardVolumePass extends Pass {
  constructor(scene, camera, sun) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.sun = sun;
    this.scale = QUALITY.high.scale;
    this.size = new THREE.Vector2(1, 1);
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    this.target.texture.name = 'Rain Court volume scattering / transmittance';
    this.uniforms = {
      sceneDepth: { value: null }, sunDepth: { value: null },
      inverseProjection: { value: new THREE.Matrix4() }, cameraWorld: { value: new THREE.Matrix4() },
      sunMatrix: { value: new THREE.Matrix4() }, eye: { value: new THREE.Vector3() },
      sunDirection: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() },
      sunTexel: { value: new THREE.Vector2(1, 1) }, hasSunShadow: { value: 0 }, sunBias: { value: 0 },
      density: { value: 1 }, time: { value: 0 },
      pointPosition: { value: [new THREE.Vector3(), new THREE.Vector3()] },
      pointColor: { value: [new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0)] },
      pointRange: { value: new THREE.Vector2() },
    };
    this.material = new THREE.ShaderMaterial({
      name: 'Courtyard shadowed volume integration', defines: { FOG_STEPS: QUALITY.high.steps },
      uniforms: this.uniforms, vertexShader, fragmentShader: volumeShader,
      depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.composite = new THREE.ShaderMaterial({
      name: 'Courtyard depth-aware volume composite',
      uniforms: {
        tDiffuse: { value: null }, sceneDepth: { value: null }, fogTexture: { value: this.target.texture },
        fogSize: { value: new THREE.Vector2(1, 1) }, cameraRange: { value: new THREE.Vector2() },
      },
      vertexShader, fragmentShader: compositeShader, depthTest: false, depthWrite: false, toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.sunPosition = new THREE.Vector3();
    this.sunTarget = new THREE.Vector3();
    this.pointLights = [];
    scene.traverseVisible(object => { if (object.isPointLight && this.pointLights.length < 2) this.pointLights.push(object); });
  }

  setQuality(quality) {
    this.scale = quality.scale;
    if (this.material.defines.FOG_STEPS !== quality.steps) {
      this.material.defines.FOG_STEPS = quality.steps;
      this.material.needsUpdate = true;
    }
    this.setSize(this.size.x, this.size.y);
  }

  setSize(width, height) {
    this.size.set(width, height);
    const w = Math.max(1, Math.round(width * this.scale));
    const h = Math.max(1, Math.round(height * this.scale));
    this.target.setSize(w, h);
    this.composite.uniforms.fogSize.value.set(w, h);
  }

  render(renderer, writeBuffer, readBuffer) {
    const u = this.uniforms;
    const camera = this.camera;
    u.sceneDepth.value = readBuffer.depthTexture;
    u.inverseProjection.value.copy(camera.projectionMatrixInverse);
    u.cameraWorld.value.copy(camera.matrixWorld);
    u.eye.value.setFromMatrixPosition(camera.matrixWorld);
    const sun = this.sun;
    if (sun) {
      sun.getWorldPosition(this.sunPosition);
      sun.target.getWorldPosition(this.sunTarget);
      u.sunDirection.value.subVectors(this.sunPosition, this.sunTarget).normalize();
      u.sunColor.value.copy(sun.color).multiplyScalar(sun.visible ? sun.intensity * .25 : 0);
      const shadow = sun.shadow;
      const shadowed = renderer.shadowMap.enabled && sun.castShadow && shadow?.map && renderer.shadowMap.type !== THREE.VSMShadowMap;
      u.hasSunShadow.value = shadowed ? 1 : 0;
      u.sunDepth.value = shadowed ? shadow.map.texture : null;
      if (shadowed) {
        u.sunMatrix.value.copy(shadow.matrix);
        u.sunTexel.value.set(1 / shadow.map.width, 1 / shadow.map.height);
        u.sunBias.value = shadow.bias - .00015;
      }
    }
    for (let i = 0; i < 2; i++) {
      const point = this.pointLights[i];
      if (point?.visible) {
        point.getWorldPosition(u.pointPosition.value[i]);
        u.pointColor.value[i].copy(point.color).multiplyScalar(point.intensity * .18);
        u.pointRange.value.setComponent(i, point.distance || 16);
      } else {
        u.pointColor.value[i].setRGB(0, 0, 0);
        u.pointRange.value.setComponent(i, 1);
      }
    }
    // This executes immediately after RenderPass. Its depth and the newly
    // rendered sun shadow map are therefore from this exact camera/frame.
    this.quad.material = this.material;
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    this.composite.uniforms.tDiffuse.value = readBuffer.texture;
    this.composite.uniforms.sceneDepth.value = readBuffer.depthTexture;
    this.composite.uniforms.cameraRange.value.set(camera.near, camera.far);
    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.composite.dispose();
    this.quad.dispose();
  }
}

const gradeShader = {
  name: 'Rain Court restrained film grade',
  uniforms: { tDiffuse: { value: null } }, vertexShader,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 color = max(source.rgb, vec3(0.0));
      float luminance = dot(color, vec3(.2126, .7152, .0722));
      color = mix(vec3(luminance), color, 1.025);
      color *= mix(vec3(1.0), vec3(.965, 1.009, 1.014), (1.0 - smoothstep(.04, .7, luminance)) * .45);
      color *= mix(vec3(1.0), vec3(1.024, 1.006, .977), smoothstep(.65, 2.5, luminance) * .5);
      vec2 p = (vUv - .5) * 1.35;
      color *= 1.0 - .085 * smoothstep(.16, .8, dot(p, p));
      gl_FragColor = vec4(max(color, vec3(0.0)), source.a);
    }
  `,
};

export function createAtmospherePost({ renderer, scene, camera, sun }) {
  const size = renderer.getSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
    type: THREE.HalfFloatType, depthBuffer: true, samples: QUALITY.high.samples,
  });
  target.depthTexture = new THREE.DepthTexture(target.width, target.height, THREE.UnsignedIntType);
  target.texture.name = 'Rain Court HDR beauty';
  // EffectComposer clones the render target, including its depth texture.
  // VolumePass always reads the current readBuffer's depth, never a cached one.
  const composer = new EffectComposer(renderer, target);
  const beauty = new RenderPass(scene, camera);
  const volume = new CourtyardVolumePass(scene, camera, sun);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .42, .55, 1.05);
  bloom.highPassUniforms.smoothWidth.value = .25;
  const grade = new ShaderPass(gradeShader);
  grade.material.depthTest = false;
  grade.material.depthWrite = false;
  grade.material.toneMapped = false;
  const output = new OutputPass();
  composer.addPass(beauty);
  composer.addPass(volume);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(output);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = true, wireframe = false, fogEnabled = true, qualityName = 'high', bloomAmount = .42;
  let previousTime = 0;

  function updatePasses() {
    const active = enabled && !wireframe;
    volume.enabled = active && fogEnabled && volume.uniforms.density.value > 0;
    bloom.enabled = active && bloomAmount > 0;
    grade.enabled = active;
    bloom.strength = bloomAmount;
  }
  function resize(width, height) {
    size.set(Math.max(1, width), Math.max(1, height));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
    const quality = QUALITY[qualityName];
    bloom.setSize(Math.max(1, Math.round(size.x * renderer.getPixelRatio() * quality.bloomScale)),
      Math.max(1, Math.round(size.y * renderer.getPixelRatio() * quality.bloomScale)));
  }
  function setQuality(value) {
    qualityName = QUALITY[value] ? value : 'balanced';
    const quality = QUALITY[qualityName];
    volume.setQuality(quality);
    for (const buffer of [composer.renderTarget1, composer.renderTarget2]) {
      if (buffer.samples !== quality.samples) {
        buffer.samples = quality.samples;
        buffer.dispose();
      }
    }
    resize(size.x, size.y);
  }
  resize(size.x, size.y);
  return {
    render(time = 0) {
      const delta = Math.min(.05, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;
      volume.uniforms.time.value = reducedMotion.matches ? 0 : time / 1000;
      // Ordinary offscreen targets are linear HDR in Three r180. OutputPass
      // alone applies renderer.toneMapping/exposure and its output color space.
      composer.render(delta);
    },
    resize, setQuality,
    setBloom(value) { bloomAmount = THREE.MathUtils.clamp(Number(value) || 0, 0, 1.5); updatePasses(); },
    setFogEnabled(value) { fogEnabled = Boolean(value); updatePasses(); },
    setFogDensity(value) { volume.uniforms.density.value = THREE.MathUtils.clamp(Number(value) || 0, 0, 2); updatePasses(); },
    setEnabled(value) { enabled = Boolean(value); updatePasses(); },
    setWireframe(value) { wireframe = Boolean(value); updatePasses(); },
    status() {
      return { enabled: enabled && !wireframe, bloom: bloom.enabled ? bloomAmount : 0, fog: volume.enabled,
        density: volume.uniforms.density.value, steps: QUALITY[qualityName].steps,
        width: volume.target.width, height: volume.target.height,
        shadowed: volume.enabled && Boolean(volume.uniforms.hasSunShadow.value) };
    },
    dispose() {
      for (const pass of [beauty, volume, bloom, grade, output]) pass.dispose();
      composer.dispose();
    },
  };
}
