import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

// The exported meshes remain standard PBR. This module adds view-dependent
// reflections in the renderer, sharing one capture across the flat courtyard.
const WATER_HEIGHT = .166;
const isWater = material => /^M10\b/.test(material.name);
const isPaving = material => /^M02\b/.test(material.name);

export function prepareRainGeometry(root) {
  root.updateMatrixWorld(true);
  const center = new THREE.Vector3();
  const point = new THREE.Vector3();
  const puddles = [[2.6, -4.5], [4.6, 0], [-5.6, -3.3], [-2, 6.6], [9, 1]];
  root.traverse(mesh => {
    if (!mesh.isMesh || Array.isArray(mesh.material) || !isWater(mesh.material)) return;
    const geometry = mesh.geometry;
    geometry.computeBoundingBox();
    geometry.boundingBox.getCenter(center).applyMatrix4(mesh.matrixWorld);
    const origin = puddles.reduce((best, candidate) =>
      Math.hypot(center.x - candidate[0], center.z - candidate[1]) < Math.hypot(center.x - best[0], center.z - best[1]) ? candidate : best);
    const positions = geometry.attributes.position;
    const edge = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      // Each puddle is a triangle fan. Interpolating 0 at its center and 1 at
      // every boundary vertex gives a continuous edge mask despite split normals.
      edge[i] = Math.hypot(point.x - origin[0], point.z - origin[1]) < .025 ? 0 : 1;
    }
    geometry.setAttribute('rainEdge', new THREE.BufferAttribute(edge, 1));
  });
}

const declarations = /* glsl */`
uniform sampler2D rainReflection;
uniform sampler2D rainWetMap;
uniform sampler2D rainRippleMap;
uniform mat4 rainProjection;
uniform vec2 rainTexel;
uniform float rainTime;
uniform float rainWetness;
uniform float rainPlanar;
uniform float rainReady;
varying vec3 vRainWorld;
#ifdef RAIN_WATER
varying float vRainEdge;
#endif

vec2 rainWorldUV() { return vec2((vRainWorld.x + 11.0) / 22.0, (9.0 - vRainWorld.z) / 18.0); }
float rainMask() {
  vec2 uv = rainWorldUV();
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return texture2D(rainWetMap, clamp(uv, 0.0, 1.0)).r * rainWetness * inside;
}
vec2 rainRipples() {
  vec2 p = vRainWorld.xz;
  vec2 a = texture2D(rainRippleMap, p * .72 + vec2(rainTime * .008, rainTime * .005)).rg * 2.0 - 1.0;
  vec2 b = texture2D(rainRippleMap, p.yx * 1.31 + vec2(-rainTime * .005, rainTime * .004)).rg * 2.0 - 1.0;
  return (a + b * .5) * (10.0 / 1.5);
}
vec3 rainBlur(vec2 uv, float rough) {
  vec2 spread = rainTexel * (1.0 + rough * rough * 95.0);
  vec3 c = texture2D(rainReflection, uv).rgb * .24;
  c += texture2D(rainReflection, uv + vec2(spread.x, 0.0)).rgb * .12;
  c += texture2D(rainReflection, uv - vec2(spread.x, 0.0)).rgb * .12;
  c += texture2D(rainReflection, uv + vec2(0.0, spread.y)).rgb * .12;
  c += texture2D(rainReflection, uv - vec2(0.0, spread.y)).rgb * .12;
  c += texture2D(rainReflection, uv + spread).rgb * .07;
  c += texture2D(rainReflection, uv - spread).rgb * .07;
  c += texture2D(rainReflection, uv + vec2(spread.x, -spread.y)).rgb * .07;
  c += texture2D(rainReflection, uv + vec2(-spread.x, spread.y)).rgb * .07;
  return c;
}
`;

function physicalMaterial(source) {
  if (source.isMeshPhysicalMaterial) return source;
  const upgraded = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(upgraded, source);
  upgraded.defines = { STANDARD: '', PHYSICAL: '' };
  return upgraded;
}

function patchSurface(material, water, uniforms) {
  material.defines = { ...material.defines, ...(water ? { RAIN_WATER: '' } : {}) };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vRainWorld;
      ${water ? 'attribute float rainEdge; varying float vRainEdge;' : ''}`);
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 rainWorldVertex = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        rainWorldVertex = batchingMatrix * rainWorldVertex;
      #endif
      #ifdef USE_INSTANCING
        rainWorldVertex = instanceMatrix * rainWorldVertex;
      #endif
      vRainWorld = (modelMatrix * rainWorldVertex).xyz;
      ${water ? 'vRainEdge = rainEdge;' : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + declarations);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float surfaceWet = rainMask();
      ${water ? `
        float shore = 1.0 - smoothstep(.72, .995, vRainEdge);
        float brokenEdge = smoothstep(.035, .22, surfaceWet);
        diffuseColor.a *= shore * brokenEdge * rainWetness;
      ` : 'diffuseColor.rgb *= mix(1.0, .43, surfaceWet);'}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      ${water ? 'roughnessFactor = mix(.15, .045, surfaceWet);' : 'roughnessFactor = mix(.73, clamp(roughnessFactor, .19, .40), surfaceWet);'}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      ${water ? `vec2 waterRipple = rainRipples() * .055;
        vec3 waterNormalWorld = normalize(vec3(waterRipple.x, 1.0, waterRipple.y));
        normal = normalize((viewMatrix * vec4(waterNormalWorld, 0.0)).xyz);` : ''}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
        material.clearcoat *= surfaceWet;
        material.clearcoatF0 = vec3(.02037);
        material.clearcoatRoughness = mix(.30, .075, surfaceWet);
      #endif`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
      vec4 rainProjected = rainProjection * vec4(vRainWorld.x, ${WATER_HEIGHT.toFixed(3)}, vRainWorld.z, 1.0);
      vec2 rainUV = rainProjected.xy / max(rainProjected.w, .0001);
      vec2 rainDistortion = rainRipples() * ${water ? '.0028' : '.0005'} * surfaceWet;
      rainUV += rainDistortion;
      vec2 rainFrame = smoothstep(vec2(.005), vec2(.035), rainUV) * (1.0 - smoothstep(vec2(.965), vec2(.995), rainUV));
      vec3 rainWorldNormal = inverseTransformDirection(normal, viewMatrix);
      float rainUp = smoothstep(.55, .95, rainWorldNormal.y);
      float rainWeight = rainFrame.x * rainFrame.y * step(.0001, rainProjected.w) * rainUp * rainPlanar * rainReady;
      ${water ? '' : `
        vec3 pavingGeometryNormal = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
        float planeEligibility = smoothstep(.9903, .9994, pavingGeometryNormal.y)
          * (1.0 - smoothstep(.025, .12, abs(vRainWorld.y - ${WATER_HEIGHT.toFixed(3)})));
        rainWeight *= planeEligibility;
      `}
      if (rainWeight > .001) {
        vec3 rainRadiance = rainBlur(clamp(rainUV, .001, .999), ${water ? 'roughnessFactor' : 'mix(.34, .1, surfaceWet)'});
        ${water ? 'radiance = mix(radiance, rainRadiance, rainWeight);' : ''}
        #ifdef USE_CLEARCOAT
          clearcoatRadiance = mix(clearcoatRadiance, rainRadiance, rainWeight);
        #endif
      }`);
  };
  material.customProgramCacheKey = () => 'rain-court-planar-v2-' + (water ? 'water' : 'paving');
  material.needsUpdate = true;
}

export async function createRainReflections({ renderer, scene, camera, meshes }) {
  const loader = new THREE.TextureLoader();
  const [wetMap, rippleMap] = await Promise.all([
    loader.loadAsync('./assets/textures/wetness-map.png'),
    loader.loadAsync('./assets/textures/ripple-normal.png'),
  ]);
  wetMap.colorSpace = rippleMap.colorSpace = THREE.NoColorSpace;
  wetMap.flipY = true;
  rippleMap.wrapS = rippleMap.wrapT = THREE.RepeatWrapping;
  const reflector = new Reflector(new THREE.PlaneGeometry(22, 18), { textureWidth: 1024, textureHeight: 768, clipBias: .001, multisample: 0 });
  reflector.rotation.x = -Math.PI / 2;
  reflector.position.y = WATER_HEIGHT;
  reflector.updateMatrixWorld(true);
  const inversePlane = reflector.matrixWorld.clone().invert();
  const uniforms = {
    rainReflection: { value: reflector.getRenderTarget().texture },
    rainWetMap: { value: wetMap }, rainRippleMap: { value: rippleMap },
    rainProjection: { value: new THREE.Matrix4() }, rainTexel: { value: new THREE.Vector2(1 / 1024, 1 / 768) },
    rainTime: { value: 0 }, rainWetness: { value: 1 }, rainPlanar: { value: 1 }, rainReady: { value: 0 },
  };
  const surfaces = meshes.filter(mesh => isPaving(mesh.material) || isWater(mesh.material));

  // Capture the actual courtyard once. The bootstrap light environment is used
  // only during this capture, then released after replacing it with the probe.
  const cubeTarget = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cubeCamera = new THREE.CubeCamera(.2, 90, cubeTarget);
  cubeCamera.position.set(0, 2.3, -1);
  const hiddenForProbe = surfaces.filter(mesh => isWater(mesh.material));
  const oldProbeVisibility = hiddenForProbe.map(mesh => mesh.visible);
  try {
    hiddenForProbe.forEach(mesh => { mesh.visible = false; });
    scene.updateMatrixWorld(true);
    cubeCamera.update(renderer, scene);
  } finally { hiddenForProbe.forEach((mesh, index) => { mesh.visible = oldProbeVisibility[index]; }); }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const courtEnvironment = pmrem.fromCubemap(cubeTarget.texture);
  scene.environment = courtEnvironment.texture;
  scene.environmentIntensity = .72;
  pmrem.dispose(); cubeTarget.dispose();

  const upgraded = new Map();
  const capturePavingMaterials = new Map();
  for (const mesh of surfaces) {
    const old = mesh.material;
    const water = isWater(old);
    if (!upgraded.has(old)) {
      const material = physicalMaterial(old);
      material.metalness = 0;
      material.ior = water ? 1.333 : 1.5;
      if (water) {
        material.clearcoat = 0;
        material.color.setRGB(.032, .046, .041);
        material.roughness = .075;
        material.transparent = true;
        material.opacity = .86;
        material.depthWrite = false;
        material.normalMap = null; // Animated world-space ripples use a shared data map.
      } else {
        material.color.setRGB(1, 1, 1); // Spatial darkening is driven by the shared wetness map.
        material.clearcoat = 1;
        material.clearcoatRoughness = .12;
        material.normalScale.multiplyScalar(.6);
        // Raised stones must appear in the water, without sampling the texture
        // that is currently being rendered. This clone has no planar shader.
        const captureMaterial = material.clone();
        captureMaterial.color.multiplyScalar(.5);
        captureMaterial.clearcoat = .45;
        capturePavingMaterials.set(material, captureMaterial);
      }
      patchSurface(material, water, uniforms);
      upgraded.set(old, material);
    }
    mesh.material = upgraded.get(old);
    if (water) { mesh.castShadow = false; mesh.renderOrder = 2; }
  }
  for (const [old, material] of upgraded) if (old !== material) old.dispose();

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let maxSize = 1024, interval = 0, lastCapture = -Infinity;
  let captures = 0, captureMs = 0;
  const lastCamera = new THREE.Matrix4();
  let forceCapture = true;

  function resize(width, height) {
    const scale = Math.min(1, maxSize / Math.max(width, height, 1));
    const w = Math.max(64, Math.round(width * scale));
    const h = Math.max(64, Math.round(height * scale));
    const target = reflector.getRenderTarget();
    if (target.width !== w || target.height !== h) {
      target.setSize(w, h); uniforms.rainTexel.value.set(1 / w, 1 / h); forceCapture = true;
    }
  }
  function update(time, force = false) {
    uniforms.rainTime.value = reducedMotion ? 0 : time / 1000;
    if (!uniforms.rainPlanar.value || !uniforms.rainWetness.value || camera.position.y < WATER_HEIGHT + .025) {
      uniforms.rainReady.value = 0; return;
    }
    camera.updateMatrixWorld();
    const changed = !lastCamera.equals(camera.matrixWorld);
    // Geometry and lighting are static: while the camera rests, animate only
    // shader ripples and reuse the captured image without extra scene renders.
    if (!force && !forceCapture && !changed) return;
    if (!force && !forceCapture && time - lastCapture < interval) return;
    const originalSurfaces = surfaces.map(mesh => ({ visible: mesh.visible, material: mesh.material }));
    const oldTarget = renderer.getRenderTarget();
    const oldXr = renderer.xr.enabled;
    const oldShadow = renderer.shadowMap.autoUpdate;
    const started = performance.now();
    try {
      // Water is hidden; exposed stones use a material with no reflection-target
      // sampler. Merely setting the planar weight to zero could still feed back.
      surfaces.forEach(mesh => {
        if (isWater(mesh.material)) mesh.visible = false;
        else mesh.material = capturePavingMaterials.get(mesh.material);
      });
      scene.updateMatrixWorld(true);
      reflector.onBeforeRender(renderer, scene, camera);
      uniforms.rainProjection.value.copy(reflector.material.uniforms.textureMatrix.value).multiply(inversePlane);
      uniforms.rainReady.value = 1;
      captures++; captureMs = performance.now() - started;
      lastCamera.copy(camera.matrixWorld); lastCapture = time; forceCapture = false;
    } finally {
      surfaces.forEach((mesh, index) => {
        mesh.visible = originalSurfaces[index].visible;
        mesh.material = originalSurfaces[index].material;
      });
      renderer.xr.enabled = oldXr; renderer.shadowMap.autoUpdate = oldShadow; renderer.setRenderTarget(oldTarget);
    }
  }
  return {
    materials: meshes.map(mesh => mesh.material),
    update, resize,
    setQuality(value) { maxSize = value === 'high' ? 1024 : value === 'balanced' ? 768 : 384; interval = value === 'low' ? 66 : value === 'balanced' ? 33 : 0; forceCapture = true; },
    setEnabled(value) { uniforms.rainPlanar.value = value ? 1 : 0; forceCapture = true; },
    setWetness(value) { uniforms.rainWetness.value = THREE.MathUtils.clamp(value, 0, 1); forceCapture = true; },
    invalidate() { forceCapture = true; },
    status() { const target = reflector.getRenderTarget(); return { captures, captureMs: Math.round(captureMs * 10) / 10, width: target.width, height: target.height }; },
    dispose() {
      for (const material of capturePavingMaterials.values()) material.dispose();
      reflector.geometry.dispose(); reflector.dispose(); courtEnvironment.dispose(); wetMap.dispose(); rippleMap.dispose();
    },
  };
}
