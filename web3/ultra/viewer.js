import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = id => document.getElementById(id);
const world = $('world');
const viewport = $('viewport');
const loading = $('load-state');
const presets = {
  court: { position: [21, 23, 29], target: [0, 1.4, -1] },
  street: { position: [8, 5.1, 11], target: [0, 2, -3.5] },
  overhead: { position: [0.1, 37, 8], target: [0, 0, 0] },
  shop: { position: [6, 4.3, 5], target: [2, 2.4, -6] },
};
const ui = { mode: 'orbit', ready: false, hidden: false, wireframe: false, preset: 'court', quality: 'high' };
let renderer, scene, camera, controls, model, sun, environmentTarget;
let transition, toastTimer, frameId, lastTime = 0, lastReadout = 0;
let meshes = [], materials = new Set();
const pressedKeys = new Set();
const vectorA = new THREE.Vector3();
const vectorB = new THREE.Vector3();
const vectorC = new THREE.Vector3();
const archiveLinks = new Map();
for (const link of document.querySelectorAll('[data-archive]')) {
  const wrapper = document.createElement('div');
  wrapper.className = 'archive-group';
  link.before(wrapper);
  wrapper.appendChild(link);
  archiveLinks.set(link.dataset.archive, { wrapper, template: link.cloneNode(true) });
}

async function refreshDownloads() {
  try {
    const response = await fetch('./downloads/manifest.json', { cache: 'no-cache' });
    if (!response.ok) return;
    const manifest = await response.json();
    for (const archive of manifest.archives || []) {
      const record = archiveLinks.get(archive.name);
      if (!record) continue;
      const outputs = (archive.outputs || []).filter(output => /^downloads\/rain-court-[a-z0-9.-]+\.zip$/.test(output.path));
      if (!outputs.length) continue;
      const links = outputs.map((output, index) => {
        const link = record.template.cloneNode(true);
        link.href = './' + output.path;
        link.removeAttribute('data-archive');
        const volume = outputs.length > 1 ? ` · ${index + 1} / ${outputs.length}` : '';
        const size = Number.isFinite(output.bytes) ? ` · ${(output.bytes / 1048576).toFixed(1)} MB` : '';
        if (link.classList.contains('download-all')) {
          link.lastChild.textContent = (outputs.length > 1 ? 'Production package' : 'Complete production package') + volume;
          link.title = (outputs.length > 1 ? `Independent ZIP volume ${index + 1} of ${outputs.length}` : 'Complete production package') + size;
        } else {
          link.querySelector('strong').textContent += volume;
          link.querySelector('small').textContent += size;
        }
        return link;
      });
      record.wrapper.replaceChildren(...links);
    }
  } catch { /* The model remains usable if the optional download manifest is unavailable. */ }
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2800);
}

function showError(error) {
  ui.ready = false;
  console.error('The Rain Court could not load:', error);
  loading.classList.remove('complete');
  loading.classList.add('error');
  $('load-eyebrow').textContent = 'LOCAL SIGNAL INTERRUPTED';
  $('load-message').textContent = 'The courtyard is out of reach';
  $('load-detail').textContent = location.protocol === 'file:'
    ? 'Serve this folder over HTTP: run npm start, then open the local address. Browser security prevents 3D files loading directly from disk.'
    : error.message?.includes('WebGL')
      ? 'This browser could not start 3D graphics. Enable hardware acceleration or try another browser. Scene downloads are still available.'
      : 'The 3D scene could not load. Check that the assets folder is beside this page, then try again. Scene downloads are still available.';
  $('retry').hidden = false;
  $('scene-state').textContent = 'SIGNAL LOST';
}

function setMode(mode) {
  ui.mode = mode;
  $('mode-orbit').classList.toggle('selected', mode === 'orbit');
  $('mode-pan').classList.toggle('selected', mode === 'pan');
  $('mode-orbit').setAttribute('aria-pressed', String(mode === 'orbit'));
  $('mode-pan').setAttribute('aria-pressed', String(mode === 'pan'));
  if (controls) {
    controls.mouseButtons.LEFT = mode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE = mode === 'pan' ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  }
  viewport.style.cursor = mode === 'pan' ? 'move' : 'grab';
  document.querySelector('.desktop-help').textContent = mode === 'pan'
    ? 'Drag to pan · Right drag to pan · Scroll to zoom'
    : 'Drag to orbit · Shift + drag to pan · Scroll to zoom';
  document.querySelector('.touch-help').textContent = mode === 'pan'
    ? 'One finger to pan · Pinch to zoom'
    : 'One finger to orbit · Two fingers to pan and zoom';
}

function setAutoOrbit(enabled) {
  if (controls) controls.autoRotate = enabled;
  $('auto-orbit').setAttribute('aria-pressed', String(enabled));
  $('auto-orbit').querySelector('span').textContent = enabled ? 'Orbiting' : 'Auto orbit';
}

function applyCamera(name, animate = true) {
  if (!camera || !controls) return;
  const preset = presets[name] || presets.court;
  ui.preset = name;
  $('camera-preset').value = name;
  setAutoOrbit(false);
  pressedKeys.clear();
  // Flush any damping left over from a drag before changing the camera.
  const damping = controls.enableDamping;
  controls.enableDamping = false;
  controls.update();
  controls.enableDamping = damping;
  const target = new THREE.Vector3(...preset.target);
  const position = new THREE.Vector3(...preset.position);
  if (name === 'court') {
    target.y = 2;
    position.sub(target).multiplyScalar(.88).add(target);
  }
  if (name === 'court' && camera.aspect < 1.1) {
    position.sub(target).multiplyScalar(Math.min(1.7, 1.1 / camera.aspect)).add(target);
  }
  if (animate && ui.ready && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    transition = { start: performance.now(), fromPosition: camera.position.clone(), fromTarget: controls.target.clone(), position, target };
  } else {
    transition = null;
    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  }
}

function zoom(factor) {
  if (!controls || !ui.ready) return;
  transition = null;
  vectorA.copy(camera.position).sub(controls.target);
  vectorA.setLength(THREE.MathUtils.clamp(vectorA.length() * factor, controls.minDistance, controls.maxDistance));
  camera.position.copy(controls.target).add(vectorA);
  controls.update();
}

function toggleDrawer(name) {
  const requested = $(`${name}-panel`);
  const open = requested.hidden;
  closeDrawers(false);
  requested.hidden = !open;
  $(`open-${name}`).setAttribute('aria-expanded', String(open));
  if (open && name === 'downloads') refreshDownloads();
  if (open) requested.querySelector('button,select,a')?.focus({ preventScroll: true });
}

function closeDrawers(restoreFocus = false) {
  for (const name of ['settings', 'downloads']) {
    const panel = $(`${name}-panel`);
    const wasOpen = !panel.hidden;
    panel.hidden = true;
    $(`open-${name}`).setAttribute('aria-expanded', 'false');
    if (wasOpen && restoreFocus) $(`open-${name}`).focus({ preventScroll: true });
  }
}

function hideInterface(hidden) {
  ui.hidden = hidden;
  world.classList.toggle('interface-hidden', hidden);
  for (const item of document.querySelectorAll('.hud')) item.inert = hidden;
  $('show-ui').hidden = !hidden;
  closeDrawers(false);
  (hidden ? $('show-ui') : $('hide-ui')).focus({ preventScroll: true });
}

function applyQuality(value) {
  ui.quality = value;
  if (!renderer) return;
  const quality = { low: { pixel: 1, shadow: false, map: 512, anisotropy: 1 }, balanced: { pixel: 1.5, shadow: true, map: 1024, anisotropy: 4 }, high: { pixel: 2, shadow: true, map: 2048, anisotropy: 8 } }[value];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.pixel));
  renderer.shadowMap.enabled = quality.shadow;
  if (sun) {
    sun.shadow.mapSize.set(quality.map, quality.map);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    sun.shadow.needsUpdate = true;
  }
  const anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), quality.anisotropy);
  for (const material of materials) {
    for (const property of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
      if (material[property]) { material[property].anisotropy = anisotropy; material[property].needsUpdate = true; }
    }
    material.needsUpdate = true;
  }
  resize();
}

function resize() {
  if (!renderer || !camera) return;
  const width = viewport.clientWidth;
  const height = Math.max(1, viewport.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function batchStaticMeshes(source) {
  source.updateMatrixWorld(true);
  const batches = new Map();
  const retained = [];
  const result = new THREE.Group();
  result.name = 'Rain Court — static render batches';
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    // Transparent objects retain independent depth sorting. Animated or multi-material
    // objects retain their original geometry and transform hierarchy semantics.
    if (mesh.isSkinnedMesh || Array.isArray(mesh.material) || mesh.material.transparent ||
      Object.keys(geometry.morphAttributes).length || Number.isFinite(geometry.drawRange.count)) {
      retained.push(mesh); continue;
    }
    const attributes = Object.keys(geometry.attributes).sort().map(name => {
      const attribute = geometry.attributes[name];
      return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array?.constructor.name || 'interleaved'}`;
    }).join('|');
    const key = [mesh.material.uuid, Boolean(geometry.index), mesh.castShadow, mesh.receiveShadow, mesh.renderOrder, attributes].join(';');
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  }
  const oldGeometry = new Set();
  for (const group of batches.values()) {
    if (group.length < 2) { retained.push(group[0]); continue; }
    const transformed = [];
    try {
      for (const mesh of group) {
        const geometry = mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrixWorld);
        // A negative transform normally reverses renderer face culling. Once the
        // transform is baked into vertices, reverse the triangle winding instead.
        if (mesh.matrixWorld.determinant() < 0) {
          if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, index) => index));
          const index = geometry.index.array;
          for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
          geometry.index.needsUpdate = true;
        }
        // Keep index layouts uniform even when a mirrored non-indexed mesh needs
        // an index for winding correction.
        if (!group[0].geometry.index && geometry.index) {
          const nonIndexed = geometry.toNonIndexed();
          geometry.dispose();
          transformed.push(nonIndexed);
        } else transformed.push(geometry);
      }
      const merged = mergeGeometries(transformed, false);
      if (!merged) throw new Error('Incompatible vertex layouts');
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const batched = new THREE.Mesh(merged, group[0].material);
      batched.name = `Render batch · ${group[0].material.name || 'surface'}`;
      batched.castShadow = group[0].castShadow;
      batched.receiveShadow = group[0].receiveShadow;
      batched.renderOrder = group[0].renderOrder;
      result.add(batched);
      for (const mesh of group) oldGeometry.add(mesh.geometry);
    } catch (error) {
      console.warn('Keeping original meshes for one render batch:', error.message);
      retained.push(...group);
    } finally {
      for (const geometry of transformed) geometry.dispose();
    }
  }
  for (const mesh of retained) result.attach(mesh);
  const retainedGeometry = new Set(retained.map(mesh => mesh.geometry));
  for (const geometry of oldGeometry) if (!retainedGeometry.has(geometry)) geometry.dispose();
  meshes = result.children.filter(object => object.isMesh);
  return result;
}

function panKeyboard(delta) {
  if (!pressedKeys.size || !ui.ready || transition) return;
  const horizontal = (pressedKeys.has('KeyD') || pressedKeys.has('ArrowRight') ? 1 : 0) - (pressedKeys.has('KeyA') || pressedKeys.has('ArrowLeft') ? 1 : 0);
  const vertical = (pressedKeys.has('KeyW') || pressedKeys.has('ArrowUp') ? 1 : 0) - (pressedKeys.has('KeyS') || pressedKeys.has('ArrowDown') ? 1 : 0);
  const speed = Math.max(1, camera.position.distanceTo(controls.target)) * delta * .32;
  vectorA.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(horizontal * speed);
  vectorB.setFromMatrixColumn(camera.matrix, 1).multiplyScalar(vertical * speed);
  vectorC.copy(vectorA).add(vectorB);
  camera.position.add(vectorC);
  controls.target.add(vectorC);
}

function render(time = 0) {
  frameId = requestAnimationFrame(render);
  const delta = Math.min((time - lastTime) / 1000 || 0, .05);
  lastTime = time;
  if (!renderer || document.hidden || !ui.ready) return;
  if (transition) {
    const progress = THREE.MathUtils.clamp((performance.now() - transition.start) / 1100, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    camera.position.lerpVectors(transition.fromPosition, transition.position, eased);
    controls.target.lerpVectors(transition.fromTarget, transition.target, eased);
    if (progress === 1) transition = null;
  }
  panKeyboard(delta);
  controls.update(delta);
  renderer.render(scene, camera);
  if (time - lastReadout > 200) {
    $('camera-coordinates').textContent = camera.position.toArray().map(value => value.toFixed(1)).join(' / ');
    const x = THREE.MathUtils.clamp(86 + controls.target.x * 3.7, 38, 132);
    const y = THREE.MathUtils.clamp(75 + controls.target.z * 3.5, 41, 111);
    const angle = controls.getAzimuthalAngle() * 180 / Math.PI;
    $('map-camera').setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${-angle})`);
    lastReadout = time;
  }
}

async function initialize() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    viewport.appendChild(renderer.domElement);
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#33413a');
    scene.fog = new THREE.FogExp2('#687567', .008);
    camera = new THREE.PerspectiveCamera(38, viewport.clientWidth / viewport.clientHeight, .1, 300);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = .075;
    controls.minDistance = 3;
    controls.maxDistance = 85;
    controls.minPolarAngle = .035;
    controls.maxPolarAngle = Math.PI * .49;
    controls.panSpeed = .7;
    controls.rotateSpeed = .55;
    controls.zoomSpeed = .7;
    controls.autoRotateSpeed = .3;
    controls.screenSpacePanning = true;
    controls.enabled = false;
    controls.addEventListener('start', () => { transition = null; setAutoOrbit(false); });
    applyCamera('court', false);
    const hemi = new THREE.HemisphereLight('#c8d1be', '#343d37', 1.35);
    scene.add(hemi);
    sun = new THREE.DirectionalLight('#ffe1aa', 3.8);
    sun.position.set(-11, 22, 11);
    sun.target.position.set(0, 0, -2);
    sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: .5, far: 75 });
    sun.shadow.bias = -.00025;
    sun.shadow.normalBias = .055;
    sun.shadow.radius = 3;
    scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight('#80c9c4', .8);
    fill.position.set(8, 10, -15);
    scene.add(fill);
    const shopLight = new THREE.PointLight('#ffc574', 60, 16, 2);
    shopLight.position.set(2, 3.2, -5.2);
    scene.add(shopLight);
    const tealLight = new THREE.PointLight('#6cfff1', 24, 9, 2);
    tealLight.position.set(-3, 2, -6.5);
    scene.add(tealLight);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environmentTarget = pmrem.fromScene(room, .03);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = .38;
    room.dispose();
    pmrem.dispose();
    applyQuality($('quality').value);
    const gltf = await new GLTFLoader().loadAsync('./assets/rain-court.glb', event => {
      const percentage = event.total ? Math.min(94, event.loaded / event.total * 94) : Math.min(85, Math.log2(event.loaded / 100000 + 1) * 12);
      $('load-progress').style.width = `${Math.max(4, percentage)}%`;
      $('load-detail').textContent = event.total ? `${Math.round(event.loaded / event.total * 100)}% received · preparing the courtyard` : `${(event.loaded / 1048576).toFixed(1)} MB received`;
    });
    model = gltf.scene;
    let vertices = 0, triangles = 0;
    model.traverse(object => {
      // A controlled viewer lighting rig avoids different watt/candela conventions across exporters.
      if (object.isLight) object.visible = false;
      if (!object.isMesh) return;
      meshes.push(object);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      object.castShadow = !objectMaterials.some(material => material.transparent && material.opacity < .6);
      object.receiveShadow = true;
      for (const material of objectMaterials) { material.wireframe = ui.wireframe; materials.add(material); }
      vertices += object.geometry.attributes.position?.count || 0;
      triangles += (object.geometry.index?.count || object.geometry.attributes.position?.count || 0) / 3;
    });
    const sourceMeshCount = meshes.length;
    model = batchStaticMeshes(model);
    scene.add(model);
    applyQuality($('quality').value);
    $('load-progress').style.width = '97%';
    $('load-detail').textContent = 'Warming the lights…';
    await renderer.compileAsync(scene, camera);
    ui.ready = true;
    controls.enabled = true;
    $('load-progress').style.width = '100%';
    $('load-detail').textContent = 'The courtyard is ready';
    $('scene-state').textContent = 'LOCAL SIGNAL ACTIVE';
    $('model-stats').textContent = `${sourceMeshCount.toLocaleString()} source meshes · ${meshes.length.toLocaleString()} render batches · ${Math.round(triangles).toLocaleString()} triangles`;
    world.classList.add('scene-ready');
    loading.classList.add('complete');
    render();
    window.dispatchEvent(new CustomEvent('raincourt-ready', { detail: { sourceMeshes: sourceMeshCount, renderBatches: meshes.length, vertices, triangles: Math.round(triangles) } }));
  } catch (error) { showError(error); }
}

$('mode-orbit').addEventListener('click', () => setMode('orbit'));
$('mode-pan').addEventListener('click', () => setMode('pan'));
$('reset').addEventListener('click', () => { applyCamera('court'); setMode('orbit'); });
$('zoom-in').addEventListener('click', () => zoom(.85));
$('zoom-out').addEventListener('click', () => zoom(1.18));
$('auto-orbit').addEventListener('click', () => { if (ui.ready) { transition = null; setAutoOrbit(!controls.autoRotate); } else toast('The courtyard is still loading.'); });
$('hide-ui').addEventListener('click', () => hideInterface(true));
$('show-ui').addEventListener('click', () => hideInterface(false));
$('open-settings').addEventListener('click', () => toggleDrawer('settings'));
$('open-downloads').addEventListener('click', () => toggleDrawer('downloads'));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDrawers(true)));
$('camera-preset').addEventListener('change', event => applyCamera(event.target.value));
$('quality').addEventListener('change', event => applyQuality(event.target.value));
$('exposure').addEventListener('input', event => {
  const value = Number(event.target.value);
  $('exposure-value').value = value.toFixed(2);
  if (renderer) renderer.toneMappingExposure = value;
});
$('wireframe').addEventListener('change', event => {
  ui.wireframe = event.target.checked;
  for (const material of materials) { material.wireframe = ui.wireframe; material.needsUpdate = true; }
});
$('atmosphere').addEventListener('change', event => { if (scene) scene.fog = event.target.checked ? new THREE.FogExp2('#687567', .008) : null; });
$('capture').addEventListener('click', () => {
  if (!ui.ready) { toast('The courtyard is still loading.'); return; }
  renderer.render(scene, camera);
  renderer.domElement.toBlob(blob => {
    if (!blob) { toast('This view could not be saved. Please try again.'); return; }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `afterlight-rain-court-${Date.now()}.png`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('Your view has been saved.');
  }, 'image/png');
});
$('retry').addEventListener('click', () => location.reload());
viewport.addEventListener('pointerdown', () => { closeDrawers(false); viewport.focus({ preventScroll: true }); });
window.addEventListener('resize', resize);
window.addEventListener('keydown', event => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName) || event.target.isContentEditable || event.ctrlKey || event.metaKey || event.altKey) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.code)) {
    event.preventDefault(); transition = null; pressedKeys.add(event.code); setAutoOrbit(false);
  }
  if (event.repeat) return;
  if (event.code === 'KeyR') { applyCamera('court'); setMode('orbit'); }
  if (event.code === 'KeyH') hideInterface(!ui.hidden);
  if (event.code === 'Escape') { closeDrawers(true); if (ui.hidden) hideInterface(false); }
  if (event.code === 'Equal' || event.code === 'NumpadAdd') zoom(.85);
  if (event.code === 'Minus' || event.code === 'NumpadSubtract') zoom(1.18);
});
window.addEventListener('keyup', event => pressedKeys.delete(event.code));
window.addEventListener('blur', () => pressedKeys.clear());
document.addEventListener('visibilitychange', () => { pressedKeys.clear(); lastTime = performance.now(); });
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  cancelAnimationFrame(frameId); controls?.dispose(); renderer?.dispose(); environmentTarget?.dispose();
});

initialize();
