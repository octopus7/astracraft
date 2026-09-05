import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer, scene, camera, controls, water, waterFallback, checkerTexture;
let materials = [], ready = false, currentMode = 'orbit', preset = 'court';
let targetTransition = null, toastTimer, frame = 0;
const savedMaterials = new Map();
const keys = new Set();
const clock = new THREE.Clock();
const presets = {
  court: { position: [25, 27, 33], target: [0, 1.4, -1], span: 23.8 },
  shop: { position: [11, 12.5, 15], target: [0.8, 2.2, -4.3], span: 15.5 },
  robot: { position: [8.6, 5.4, 10.8], target: [3, 1.1, 1.8], span: 6.6 },
};

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2600);
}

function fail(error) {
  console.error(error);
  $('loading').style.display = 'none';
  $('error').hidden = false;
  $('error-message').textContent = location.protocol === 'file:'
    ? 'Open this folder through a local HTTP server or the hosted collection to load the model.'
    : 'The model or graphics context was unavailable. Reload the view, or open the scene render below.';
  $('scene-status').textContent = 'SIGNAL INTERRUPTED';
}

function setFrustum(span) {
  const aspect = innerWidth / innerHeight;
  // Keep the courtyard legible on portrait screens without cropping its width.
  const height = aspect < .95 ? span / Math.max(aspect, .5) * .8 : span;
  camera.left = -height * aspect / 2;
  camera.right = height * aspect / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();
}

function goTo(name, instant = false) {
  preset = name;
  const p = presets[name];
  for (const key of ['court', 'shop', 'robot']) {
    $(`view-${key}`).classList.toggle('active', key === name);
    $(`view-${key}`).setAttribute('aria-pressed', String(key === name));
  }
  if (instant || reduceMotion) {
    camera.position.fromArray(p.position);
    controls.target.fromArray(p.target);
    camera.zoom = 1;
    setFrustum(p.span);
    controls.update();
    targetTransition = null;
  } else {
    targetTransition = {
      start: performance.now(), position: camera.position.clone(), target: controls.target.clone(),
      nextPosition: new THREE.Vector3(...p.position), nextTarget: new THREE.Vector3(...p.target),
      oldSpan: camera.top * 2 / camera.zoom, newSpan: p.span,
    };
  }
}

function setMode(mode) {
  currentMode = mode;
  controls.mouseButtons.LEFT = mode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  controls.touches.ONE = mode === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  for (const name of ['orbit', 'pan']) {
    $(name).classList.toggle('selected', name === mode);
    $(name).setAttribute('aria-pressed', String(name === mode));
  }
  $('control-hint').textContent = mode === 'pan'
    ? 'Drag to pan · Scroll to zoom · Select Orbit to rotate'
    : 'Drag to orbit · Shift + drag to pan · Scroll to zoom';
  canvas.style.cursor = mode === 'pan' ? 'grab' : 'default';
}

function makeWater(geometries, material) {
  const full = mergeGeometries(geometries, false);
  waterFallback = new THREE.Mesh(full, material);
  waterFallback.name = 'Exported PBR water';
  waterFallback.receiveShadow = true;
  waterFallback.visible = false;
  scene.add(waterFallback);
  const planeGeometry = full.clone();
  const pos = planeGeometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i), -pos.getZ(i), 0);
  planeGeometry.computeVertexNormals();
  planeGeometry.computeBoundingSphere();
  const shader = {
    ...Reflector.ReflectorShader,
    uniforms: { ...THREE.UniformsUtils.clone(Reflector.ReflectorShader.uniforms), time: { value: 0 } },
    fragmentShader: Reflector.ReflectorShader.fragmentShader
      .replace('uniform vec3 color;', 'uniform vec3 color; uniform float time;')
      .replace('vec4 base = texture2DProj( tDiffuse, vUv );', `
        vec4 sampleUv = vUv;
        vec2 uv = vUv.xy / vUv.w;
        sampleUv.xy += vec2(sin(uv.y * 330.0 + time * .3), cos(uv.x * 250.0 + time * .2)) * .00055 * vUv.w;
        vec4 base = texture2DProj(tDiffuse, sampleUv);
        base.rgb = mix(base.rgb, vec3(.037, .060, .058), .26);
      `),
  };
  water = new Reflector(planeGeometry, {
    textureWidth: Math.min(innerWidth, 1400), textureHeight: Math.min(innerHeight, 1000),
    color: 0x777c72, clipBias: .001, multisample: 0, shader,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = .116;
  water.name = 'Local planar rainwater reflections';
  // Orthographic reflection with a world-space clip plane. This avoids the
  // perspective-only oblique matrix in Three's stock Reflector helper.
  const mirrorCamera = camera.clone();
  const reflectionMatrix = water.material.uniforms.textureMatrix.value;
  const reflectedDirection = new THREE.Vector3();
  const reflectedUp = new THREE.Vector3();
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.117);
  water.onBeforeRender = (r, s, viewCamera) => {
    if (viewCamera.position.y < water.position.y) return;
    mirrorCamera.position.copy(viewCamera.position);
    mirrorCamera.position.y = 2 * water.position.y - viewCamera.position.y;
    viewCamera.getWorldDirection(reflectedDirection);
    reflectedDirection.y *= -1;
    reflectedUp.set(0, 1, 0).applyQuaternion(viewCamera.quaternion);
    reflectedUp.y *= -1;
    mirrorCamera.up.copy(reflectedUp);
    mirrorCamera.lookAt(reflectedDirection.add(mirrorCamera.position));
    mirrorCamera.projectionMatrix.copy(viewCamera.projectionMatrix);
    mirrorCamera.projectionMatrixInverse.copy(viewCamera.projectionMatrixInverse);
    mirrorCamera.updateMatrixWorld();
    reflectionMatrix.set(.5,0,0,.5, 0,.5,0,.5, 0,0,.5,.5, 0,0,0,1);
    reflectionMatrix.multiply(mirrorCamera.projectionMatrix).multiply(mirrorCamera.matrixWorldInverse).multiply(water.matrixWorld);
    const oldTarget = r.getRenderTarget();
    const oldClipping = r.clippingPlanes;
    const oldShadowUpdate = r.shadowMap.autoUpdate;
    water.visible = false;
    r.clippingPlanes = [clipPlane];
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(water.getRenderTarget());
    r.clear(); r.render(s, mirrorCamera);
    r.setRenderTarget(oldTarget);
    r.clippingPlanes = oldClipping;
    r.shadowMap.autoUpdate = oldShadowUpdate;
    water.visible = true;
  };
  scene.add(water);
  geometries.forEach((g) => g.dispose());
}

function prepareModel(gltf) {
  gltf.scene.updateMatrixWorld(true);
  const groups = new Map();
  const waterGeometry = [];
  let waterMaterial, meshCount = 0, triangles = 0;
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return;
    meshCount++;
    triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
    const material = object.material;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    // Retain the canonical glTF attributes shared by all primitives for batching.
    for (const attr of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(attr)) geometry.deleteAttribute(attr);
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    if (material.name.includes('shallow rainwater')) {
      waterGeometry.push(geometry); waterMaterial = material; return;
    }
    if (!groups.has(material.uuid)) groups.set(material.uuid, { material, geometries: [] });
    groups.get(material.uuid).geometries.push(geometry);
  });
  for (const { material, geometries } of groups.values()) {
    const combined = mergeGeometries(geometries, false);
    if (!combined) throw new Error(`Could not batch ${material.name}`);
    const mesh = new THREE.Mesh(combined, material);
    mesh.name = material.name;
    mesh.castShadow = !material.name.startsWith('Emission');
    mesh.receiveShadow = true;
    if (material.name.startsWith('Foliage')) material.side = THREE.DoubleSide;
    material.envMapIntensity = material.metalness > .4 ? .75 : .3;
    for (const texture of [material.map, material.normalMap, material.roughnessMap]) {
      if (texture) texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }
    savedMaterials.set(material, {
      map: material.map, normalMap: material.normalMap, roughnessMap: material.roughnessMap,
      color: material.color.clone(), roughness: material.roughness, metalness: material.metalness,
    });
    materials.push(material);
    scene.add(mesh);
    geometries.forEach((g) => g.dispose());
  }
  makeWater(waterGeometry, waterMaterial);
  // Release the source geometries after building browser-only material batches.
  const sourceGeometries = new Set();
  gltf.scene.traverse((o) => { if (o.isMesh) sourceGeometries.add(o.geometry); });
  sourceGeometries.forEach((g) => g.dispose());
  $('stat-meshes').textContent = `${meshCount.toLocaleString()} mesh parts`;
  $('stat-triangles').textContent = `${Math.round(triangles).toLocaleString()} triangles`;
  // Read-only QA telemetry, also useful when embedding this static viewer.
  window.afterlight = {
    ready: true, sourceMeshParts: meshCount, triangles: Math.round(triangles), materialBatches: materials.length,
    getCamera: () => ({ position: camera.position.toArray(), target: controls.target.toArray(), zoom: camera.zoom }),
    getRenderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  };
}

function practical(x, y, z, color, intensity, distance) {
  const lamp = new THREE.PointLight(color, intensity, distance, 2);
  lamp.position.set(x, z, -y);
  scene.add(lamp);
}

async function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x293438);
  scene.fog = new THREE.FogExp2(0x394540, .005);
  camera = new THREE.OrthographicCamera(-20, 20, 15, -15, .1, 220);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !reduceMotion;
  controls.dampingFactor = .085;
  controls.minZoom = .35;
  controls.maxZoom = 5;
  controls.minPolarAngle = .2;
  controls.maxPolarAngle = Math.PI * .47;
  controls.screenSpacePanning = false;
  controls.panSpeed = .8;
  controls.rotateSpeed = .48;
  controls.zoomSpeed = .85;
  controls.addEventListener('start', () => { targetTransition = null; });
  controls.addEventListener('change', () => {
    const t = controls.target;
    $('coordinates').textContent = `X ${t.x >= 0 ? '+' : ''}${t.x.toFixed(1)} / Y ${-t.z >= 0 ? '+' : ''}${(-t.z).toFixed(1)}`;
    const theta = controls.getAzimuthalAngle() * 180 / Math.PI;
    $('map-cone').style.transform = `rotate(${-theta}deg)`;
  });
  goTo('court', true);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, .04).texture;
  room.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xc4d9de, 0x414032, .8));
  const sun = new THREE.DirectionalLight(0xffd39a, 2.9);
  sun.position.set(-13, 23, -5);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -29, right: 29, top: 29, bottom: -29, near: 1, far: 85 });
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.normalBias = .035;
  sun.shadow.bias = -.00015;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xa8cbd3, .6);
  fill.position.set(15, 10, 10); scene.add(fill);
  practical(-.58, 4.86, 2.15, 0xff943e, 32, 6);
  practical(4.88, 4.86, 2.15, 0xff943e, 32, 6);
  practical(1, 4.95, 1.73, 0xffc068, 12, 4);
  practical(-4.2, 6.70, 2.7, 0x64e1ec, 28, 6);
  practical(8.2, -5.8, 2.8, 0x55d9e0, 13, 5);

  const gltf = await new GLTFLoader().loadAsync('./assets/models/afterlight-rain-court.glb', (event) => {
    const fraction = event.total ? event.loaded / event.total : Math.min(.85, event.loaded / 9e6);
    $('loading-bar').style.width = `${Math.min(93, fraction * 93)}%`;
    $('loading-label').textContent = fraction >= .98 ? 'Preparing the courtyard' : `Receiving local signal · ${Math.round(fraction * 100)}%`;
  });
  prepareModel(gltf);
  ready = true;
  renderer.render(scene, camera);
  $('loading-bar').style.width = '100%';
  $('scene-status').textContent = 'SIGNAL RESTORED';
  $('loading').style.opacity = '0';
  setTimeout(() => { $('loading').style.display = 'none'; }, 650);
  animate();
  await loadMetadata();
}

async function loadMetadata() {
  try {
    const response = await fetch('./docs/downloads.json');
    if (!response.ok) return;
    const sizes = await response.json();
    for (const [key, value] of Object.entries(sizes)) {
      const target = document.querySelector(`[data-size="${key}"]`);
      if (target) target.textContent = `${(value / 1048576).toFixed(1)} MB`;
    }
  } catch { /* File links remain usable without display metadata. */ }
}

function animate() {
  requestAnimationFrame(animate);
  if (!ready || document.hidden) return;
  const dt = Math.min(clock.getDelta(), .05);
  if (targetTransition) {
    const t = Math.min(1, (performance.now() - targetTransition.start) / 1050);
    const eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(targetTransition.position, targetTransition.nextPosition, eased);
    controls.target.lerpVectors(targetTransition.target, targetTransition.nextTarget, eased);
    camera.zoom = 1;
    setFrustum(THREE.MathUtils.lerp(targetTransition.oldSpan, targetTransition.newSpan, eased));
    if (t === 1) targetTransition = null;
  }
  if (keys.size) {
    const speed = 7 * dt / camera.zoom;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0); right.y = 0; right.normalize();
    const forward = new THREE.Vector3().subVectors(controls.target, camera.position); forward.y = 0; forward.normalize();
    const move = new THREE.Vector3();
    if (keys.has('w') || keys.has('arrowup')) move.addScaledVector(forward, speed);
    if (keys.has('s') || keys.has('arrowdown')) move.addScaledVector(forward, -speed);
    if (keys.has('d') || keys.has('arrowright')) move.addScaledVector(right, speed);
    if (keys.has('a') || keys.has('arrowleft')) move.addScaledVector(right, -speed);
    camera.position.add(move); controls.target.add(move);
  }
  controls.update();
  if (water?.visible && !reduceMotion) water.material.uniforms.time.value += dt;
  renderer.render(scene, camera);
  frame++;
}

function toggleHud() {
  const hidden = document.body.classList.toggle('hud-hidden');
  document.querySelectorAll('.hud').forEach((element) => { element.inert = hidden; element.setAttribute('aria-hidden', String(hidden)); });
  $('show-hud').hidden = !hidden;
  (hidden ? $('show-hud') : $('hide-hud')).focus();
}
function openDialog(id) {
  keys.clear();
  $(id).showModal();
}
for (const key of ['court', 'shop', 'robot']) $(`view-${key}`).addEventListener('click', () => ready && goTo(key));
$('orbit').addEventListener('click', () => ready && setMode('orbit'));
$('pan').addEventListener('click', () => ready && setMode('pan'));
$('reset').addEventListener('click', () => { if (ready) { goTo('court'); setMode('orbit'); toast('Camera returned to the courtyard'); } });
$('hide-hud').addEventListener('click', toggleHud);
$('show-hud').addEventListener('click', toggleHud);
$('download-open').addEventListener('click', () => openDialog('download-dialog'));
$('settings-open').addEventListener('click', () => openDialog('settings-dialog'));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
$('exposure').addEventListener('input', (event) => {
  const exposure = Number(event.target.value);
  $('exposure-value').textContent = exposure.toFixed(2);
  if (renderer) renderer.toneMappingExposure = exposure;
});
function updateWater() {
  if (!water) return;
  const diagnostic = $('wireframe').checked || $('checker').checked;
  water.visible = $('reflections').checked && !diagnostic;
  waterFallback.visible = !water.visible;
  waterFallback.material.wireframe = $('wireframe').checked;
}
$('reflections').addEventListener('change', updateWater);
$('wireframe').addEventListener('change', (e) => { for (const m of materials) m.wireframe = e.target.checked; updateWater(); });
$('checker').addEventListener('change', async (event) => {
  const on = event.target.checked;
  if (on && !checkerTexture) {
    try {
      checkerTexture = await new THREE.TextureLoader().loadAsync('./assets/textures/uv-checker.png');
      checkerTexture.colorSpace = THREE.SRGBColorSpace;
      checkerTexture.anisotropy = 4;
    } catch { event.target.checked = false; toast('The UV checker could not load'); return; }
  }
  // A second click during image decoding should restore the latest state.
  const active = $('checker').checked;
  for (const material of materials) {
    const original = savedMaterials.get(material);
    material.map = active ? checkerTexture : original.map;
    material.normalMap = active ? null : original.normalMap;
    material.roughnessMap = active ? null : original.roughnessMap;
    material.color.copy(active ? new THREE.Color(0xffffff) : original.color);
    material.metalness = active ? 0 : original.metalness;
    material.roughness = active ? .9 : original.roughness;
    material.needsUpdate = true;
  }
  updateWater();
});
$('photo').addEventListener('click', () => {
  if (!ready) return;
  renderer.render(scene, camera);
  canvas.toBlob((blob) => {
    if (!blob) { toast('Capture unavailable'); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'afterlight-rain-court.png'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('View captured');
  }, 'image/png');
});
addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (document.querySelector('dialog[open]') || /input|textarea|select/i.test(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) { event.preventDefault(); keys.add(key); targetTransition = null; }
  if (key === 'r' && ready) { goTo('court'); setMode('orbit'); }
  if (key === 'h') toggleHud();
});
addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
addEventListener('resize', () => {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight);
  setFrustum(presets[preset].span);
  if (water) water.getRenderTarget().setSize(Math.min(innerWidth, 1400), Math.min(innerHeight, 1000));
});
canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); ready = false; fail(new Error('WebGL context lost')); });
init().catch(fail);
