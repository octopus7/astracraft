import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  DISTRICT_CONFIG,
  HAZARDS,
  REPAIR_NODES,
  SUPPLY_CACHES,
  createGameState,
  formatTime,
  getObjective,
  startShift,
  tickGame,
  triggerScan,
  useCoolant
} from './game-core.js';

const byId = (id) => document.getElementById(id);
const ui = {
  shell: byId('game'),
  canvas: byId('viewport'),
  radar: byId('radar'),
  boot: byId('boot-screen'),
  result: byId('result-screen'),
  pause: byId('pause-card'),
  start: byId('start-button'),
  restart: byId('restart-button'),
  pauseButton: byId('pause-button'),
  resume: byId('resume-button'),
  audio: byId('audio-toggle'),
  loadStatus: byId('load-status'),
  clock: byId('clock'),
  orderIndex: byId('order-index'),
  objectiveTitle: byId('objective-title'),
  objectiveCopy: byId('objective-copy'),
  objectiveProgress: byId('objective-progress'),
  repairCount: byId('repair-count'),
  score: byId('score'),
  integrity: byId('integrity-value'),
  energy: byId('energy-value'),
  integrityMeter: byId('integrity-meter'),
  energyMeter: byId('energy-meter'),
  rigState: byId('rig-state'),
  cells: byId('cells-count'),
  coolant: byId('coolant-count'),
  interaction: byId('interaction'),
  interactionTitle: byId('interaction-title'),
  interactionDetail: byId('interaction-detail'),
  repairRing: byId('repair-ring'),
  toasts: byId('toast-stack'),
  resultKicker: byId('result-kicker'),
  resultTitle: byId('result-title'),
  resultCopy: byId('result-copy'),
  resultRepairs: byId('result-repairs'),
  resultScore: byId('result-score'),
  resultTime: byId('result-time')
};

const world = {
  repairs: new Map(),
  caches: new Map(),
  hazards: new Map(),
  drones: [],
  particles: [],
  districtModel: null,
  roverModel: null,
  scanWave: null,
  clickMarker: null
};

let state = createGameState();
let phase = 'boot';
let paused = false;
let lastTime = performance.now();
let elapsedVisual = 0;
let moveTarget = null;
let autoRepairTarget = null;
let audioContext = null;
let audioEnabled = false;
let introHintShown = false;

const keys = new Set();
const playerPosition = new THREE.Vector3(
  DISTRICT_CONFIG.playerStart.x,
  0,
  DISTRICT_CONFIG.playerStart.z
);
const playerVelocity = new THREE.Vector3();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071012);
scene.fog = new THREE.FogExp2(0x071012, 0.027);

const renderer = new THREE.WebGLRenderer({
  canvas: ui.canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const camera = new THREE.OrthographicCamera(-12, 12, 8, -8, 0.1, 120);
const cameraTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3(17, 22, 17);
camera.position.copy(cameraOffset);
camera.lookAt(0, 0, 0);

const hemiLight = new THREE.HemisphereLight(0x9bdad9, 0x17201f, 1.45);
scene.add(hemiLight);
const keyLight = new THREE.DirectionalLight(0xffdfad, 2.65);
keyLight.position.set(-12, 24, 9);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -28;
keyLight.shadow.camera.right = 28;
keyLight.shadow.camera.top = 28;
keyLight.shadow.camera.bottom = -28;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 70;
keyLight.shadow.bias = -0.0007;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x4edbd6, 0.7);
fillLight.position.set(15, 9, -18);
scene.add(fillLight);

const worldRoot = new THREE.Group();
worldRoot.name = 'RepairDistrictRuntime';
scene.add(worldRoot);

const playerRoot = new THREE.Group();
playerRoot.name = 'PlayerServiceRover';
playerRoot.position.copy(playerPosition);
worldRoot.add(playerRoot);

const atlasLoader = new THREE.TextureLoader();
const atlasTexture = atlasLoader.load(assetUrl('./assets/textures/district-atlas-imagegen.png'));
atlasTexture.colorSpace = THREE.SRGBColorSpace;
atlasTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const palette = {
  deck: new THREE.MeshStandardMaterial({ color: 0x263437, roughness: 0.89, metalness: 0.24 }),
  deckDark: new THREE.MeshStandardMaterial({ color: 0x131e20, roughness: 0.82, metalness: 0.42 }),
  ivory: new THREE.MeshStandardMaterial({ color: 0xd5d4c2, roughness: 0.55, metalness: 0.18 }),
  graphite: new THREE.MeshStandardMaterial({ color: 0x273033, roughness: 0.58, metalness: 0.68 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xc75f32, roughness: 0.66, metalness: 0.35 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xffb344, roughness: 0.45, metalness: 0.32, emissive: 0x8b3f0c, emissiveIntensity: 0.52 }),
  cyan: new THREE.MeshStandardMaterial({ color: 0x5ee4df, roughness: 0.35, metalness: 0.2, emissive: 0x147f83, emissiveIntensity: 1.35 }),
  red: new THREE.MeshStandardMaterial({ color: 0xe84a45, roughness: 0.4, metalness: 0.25, emissive: 0x7a1111, emissiveIntensity: 1.1 })
};

const repairLookup = Object.fromEntries(REPAIR_NODES.map((node) => [node.id, node]));
const hazardLookup = Object.fromEntries(HAZARDS.map((hazard) => [hazard.id, hazard]));
const cacheLookup = Object.fromEntries(SUPPLY_CACHES.map((cache) => [cache.id, cache]));

setupMeters(ui.integrityMeter);
setupMeters(ui.energyMeter);
createDistrict();
createRepairStations();
createHazards();
createCaches();
createPlayerFallback();
createAmbientParticles();
loadPortableAssets();
bindInput();
resize();
updateUI();
requestAnimationFrame(frame);

function assetUrl(relativePath) {
  return new URL(relativePath, document.baseURI).href;
}

function setupMeters(element) {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < 10; index += 1) fragment.append(document.createElement('i'));
  element.append(fragment);
}

function makeAtlasVariant(column, row) {
  const texture = atlasTexture.clone();
  texture.needsUpdate = true;
  texture.repeat.set(0.25, 0.25);
  texture.offset.set(column * 0.25, 0.75 - row * 0.25);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function createDistrict() {
  const floorMaterials = [
    new THREE.MeshStandardMaterial({ map: makeAtlasVariant(0, 0), color: 0x778588, roughness: 0.92, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ map: makeAtlasVariant(1, 0), color: 0x5c6565, roughness: 0.85, metalness: 0.32 }),
    new THREE.MeshStandardMaterial({ map: makeAtlasVariant(0, 2), color: 0x6d716f, roughness: 1, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ map: makeAtlasVariant(1, 2), color: 0x709695, roughness: 0.82, metalness: 0.22 })
  ];
  const tileGeometry = new THREE.BoxGeometry(5.85, 0.18, 5.85);
  for (let x = -3; x <= 3; x += 1) {
    for (let z = -3; z <= 3; z += 1) {
      const tile = new THREE.Mesh(tileGeometry, floorMaterials[Math.abs(x * 7 + z * 3) % floorMaterials.length]);
      tile.position.set(x * 6, -0.16 - ((x + z) % 3 === 0 ? 0.035 : 0), z * 6);
      tile.receiveShadow = true;
      tile.name = `DeckTile_${x}_${z}`;
      worldRoot.add(tile);
    }
  }

  const grid = new THREE.GridHelper(42, 42, 0x3a7373, 0x254244);
  grid.position.y = -0.045;
  grid.material.opacity = 0.18;
  grid.material.transparent = true;
  worldRoot.add(grid);

  createSafetyLines();
  createPerimeterStructures();
  createClickMarker();
}

function createSafetyLines() {
  const lineMaterial = new THREE.MeshStandardMaterial({
    color: 0xb1782d,
    roughness: 0.76,
    emissive: 0x5d2b08,
    emissiveIntensity: 0.2
  });
  const lineGeometry = new THREE.BoxGeometry(0.15, 0.025, 1.2);
  const routes = [
    { start: [-14, 11], count: 23, axis: 'x' },
    { start: [11, -14], count: 23, axis: 'z' },
    { start: [-13, -13], count: 16, axis: 'x' }
  ];
  for (const route of routes) {
    for (let index = 0; index < route.count; index += 1) {
      const dash = new THREE.Mesh(lineGeometry, lineMaterial);
      if (route.axis === 'x') {
        dash.rotation.y = Math.PI / 2;
        dash.position.set(route.start[0] + index * 1.2, -0.035, route.start[1]);
      } else {
        dash.position.set(route.start[0], -0.035, route.start[1] + index * 1.2);
      }
      dash.receiveShadow = true;
      worldRoot.add(dash);
    }
  }
}

function createPerimeterStructures() {
  const seeded = mulberry32(70704);
  const outerPositions = [];
  for (let index = -4; index <= 4; index += 1) {
    outerPositions.push([index * 5.2, -23], [index * 5.2, 23], [-23, index * 5.2], [23, index * 5.2]);
  }
  const colors = [0x172629, 0x223437, 0x2b3333, 0x3b3028];
  outerPositions.forEach(([x, z], index) => {
    if (index % 5 === 0) return;
    const height = 3.4 + seeded() * 7;
    const width = 3.2 + seeded() * 2.6;
    const depth = 3.2 + seeded() * 2.3;
    const material = new THREE.MeshStandardMaterial({
      color: colors[index % colors.length],
      roughness: 0.78,
      metalness: 0.48
    });
    const block = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    block.position.set(x, height * 0.5 - 0.04, z);
    block.rotation.y = (seeded() - 0.5) * 0.1;
    block.castShadow = true;
    block.receiveShadow = true;
    worldRoot.add(block);

    const cap = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 0.12, depth * 0.82), index % 3 === 0 ? palette.orange : palette.graphite);
    cap.position.set(x, height + 0.04, z);
    cap.rotation.y = block.rotation.y;
    cap.castShadow = true;
    worldRoot.add(cap);

    if (index % 3 === 0) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(width * 0.45, 0.08, 0.08), palette.cyan);
      lamp.position.set(x, height * 0.78, z + (z < 0 ? depth * 0.51 : -depth * 0.51));
      worldRoot.add(lamp);
    }
  });

  const crane = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.65, 10, 0.65), palette.graphite);
  mast.position.y = 5;
  mast.castShadow = true;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 0.55, 0.55), palette.orange);
  arm.position.set(-4.5, 9.25, 0);
  arm.castShadow = true;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 6, 8), palette.graphite);
  cable.position.set(-8, 6.1, 0);
  crane.add(mast, arm, cable);
  crane.position.set(19, 0, -17);
  worldRoot.add(crane);
}

function createRepairStations() {
  REPAIR_NODES.forEach((node, index) => {
    const group = new THREE.Group();
    group.name = `RepairStation_${node.id}`;
    group.position.set(node.position.x, 0, node.position.z);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.5, 0.35, 8), palette.graphite);
    base.position.y = 0.12;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.72, 1.75, 6), index % 2 ? palette.orange : palette.deck);
    pedestal.position.y = 1.08;
    pedestal.castShadow = true;
    group.add(pedestal);

    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), palette.red.clone());
    core.material.emissiveIntensity = 1.5;
    core.position.y = 2.15;
    core.castShadow = true;
    group.add(core);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.045, 8, 44),
      new THREE.MeshBasicMaterial({ color: 0xff684f, transparent: true, opacity: 0.75 })
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.37;
    group.add(halo);

    const beacon = new THREE.PointLight(0xff493c, 1.1, 5, 2);
    beacon.position.y = 2.1;
    group.add(beacon);

    const label = createLabelSprite(node.shortLabel, '#ffbd58');
    label.position.set(0, 3.05, 0);
    group.add(label);

    group.userData = { node, core, halo, beacon, label, repaired: false };
    world.repairs.set(node.id, group);
    worldRoot.add(group);
  });
}

function createHazards() {
  HAZARDS.forEach((hazard, index) => {
    const group = new THREE.Group();
    group.name = `Hazard_${hazard.id}`;
    group.position.set(hazard.position.x, 0.015, hazard.position.z);

    const field = new THREE.Mesh(
      new THREE.CircleGeometry(hazard.radius, 48),
      new THREE.MeshBasicMaterial({ color: index === 1 ? 0xffae36 : 0xe83f4d, transparent: true, opacity: 0.09, depthWrite: false })
    );
    field.rotation.x = -Math.PI / 2;
    group.add(field);

    const edge = new THREE.Mesh(
      new THREE.TorusGeometry(hazard.radius, 0.055, 8, 64),
      new THREE.MeshBasicMaterial({ color: index === 1 ? 0xffb33f : 0xff4e58, transparent: true, opacity: 0.62 })
    );
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.04;
    group.add(edge);

    const fault = new THREE.Group();
    for (let shardIndex = 0; shardIndex < 5; shardIndex += 1) {
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.1 + shardIndex * 0.018), palette.red);
      const angle = (shardIndex / 5) * Math.PI * 2;
      shard.position.set(Math.cos(angle) * 0.75, 0.3 + shardIndex * 0.12, Math.sin(angle) * 0.75);
      fault.add(shard);
    }
    group.add(fault);
    group.userData = { hazard, field, edge, fault };
    world.hazards.set(hazard.id, group);
    worldRoot.add(group);
  });
}

function createCaches() {
  SUPPLY_CACHES.forEach((cache, index) => {
    const group = new THREE.Group();
    group.name = `SupplyCache_${cache.id}`;
    group.position.set(cache.position.x, 0, cache.position.z);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 0.68), index % 2 ? palette.ivory : palette.orange);
    box.position.y = 0.39;
    box.rotation.y = Math.PI * 0.25;
    box.castShadow = true;
    group.add(box);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.69, 0.72), palette.amber);
    band.position.copy(box.position);
    band.rotation.copy(box.rotation);
    group.add(band);
    const light = new THREE.PointLight(0xffbc52, 0.65, 3.5);
    light.position.y = 0.8;
    group.add(light);
    group.userData = { cache, box, light, collected: false };
    world.caches.set(cache.id, group);
    worldRoot.add(group);
  });
}

function createPlayerFallback() {
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.48, 1.65), palette.ivory);
  chassis.position.y = 0.62;
  chassis.castShadow = true;
  playerRoot.add(chassis);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.55, 0.75), palette.orange);
  cab.position.set(0, 1.02, -0.14);
  cab.castShadow = true;
  playerRoot.add(cab);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.05), palette.cyan);
  glass.position.set(0, 1.06, -0.535);
  playerRoot.add(glass);
  const wheelGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.22, 12);
  for (const x of [-0.69, 0.69]) {
    for (const z of [-0.53, 0.53]) {
      const wheel = new THREE.Mesh(wheelGeometry, palette.graphite);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.35, z);
      wheel.castShadow = true;
      playerRoot.add(wheel);
    }
  }
  const rigLight = new THREE.PointLight(0x55e7df, 1.1, 4.5);
  rigLight.position.set(0, 1.3, -0.5);
  playerRoot.add(rigLight);
}

function createAmbientParticles() {
  const count = 210;
  const positions = new Float32Array(count * 3);
  const seeded = mulberry32(51517);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (seeded() - 0.5) * 52;
    positions[index * 3 + 1] = seeded() * 9 + 0.3;
    positions[index * 3 + 2] = (seeded() - 0.5) * 52;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0x91d4d0, size: 0.045, transparent: true, opacity: 0.34, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  points.name = 'MaintenanceDust';
  worldRoot.add(points);
  world.particles.push(points);
}

function createClickMarker() {
  const group = new THREE.Group();
  group.visible = false;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.36, 0.43, 32),
    new THREE.MeshBasicMaterial({ color: 0x6ee9e4, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  worldRoot.add(group);
  world.clickMarker = group;
}

function createLabelSprite(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(3, 12, 14, .82)';
  context.fillRect(12, 10, 232, 48);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(12, 10, 232, 48);
  context.fillStyle = color;
  context.font = '700 23px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 128, 34);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.55, 0.72, 1);
  return sprite;
}

async function loadPortableAssets() {
  const loadingManager = new THREE.LoadingManager();
  const loader = new GLTFLoader(loadingManager);
  let lastPercent = 4;
  loadingManager.onProgress = (_url, loaded, total) => {
    lastPercent = Math.max(lastPercent, Math.round((loaded / Math.max(total, 1)) * 94));
    ui.loadStatus.textContent = `DISTRICT LOADING // ${String(lastPercent).padStart(2, '0')}%`;
  };

  const tasks = [
    loadGltf(loader, './assets/models/repair-district.gltf').then((gltf) => installDistrictModel(gltf.scene)),
    loadGltf(loader, './assets/models/service-rover.gltf').then((gltf) => installRoverModel(gltf.scene)),
    loadGltf(loader, './assets/models/salvage-drone.gltf').then((gltf) => installDroneModels(gltf.scene))
  ];

  const results = await Promise.allSettled(tasks);
  const loaded = results.filter((result) => result.status === 'fulfilled').length;
  ui.loadStatus.textContent = loaded === tasks.length
    ? 'DISTRICT LINK READY // GLTF 2.0'
    : `DISTRICT LINK READY // ${loaded} MODEL${loaded === 1 ? '' : 'S'} + FALLBACK`;
  ui.start.disabled = false;
  ui.shell.dataset.phase = 'briefing';
  phase = 'briefing';
}

function loadGltf(loader, relativePath) {
  return new Promise((resolve, reject) => {
    loader.load(assetUrl(relativePath), resolve, undefined, reject);
  });
}

function markRenderable(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material?.map) object.material.map.colorSpace = THREE.SRGBColorSpace;
  });
}

function installDistrictModel(model) {
  model.name = 'PortableRepairDistrictGLTF';
  markRenderable(model);
  model.position.y = 0;
  worldRoot.add(model);
  world.districtModel = model;
}

function installRoverModel(model) {
  markRenderable(model);
  fitAsset(model, 2.25);
  playerRoot.clear();
  playerRoot.add(model);
  const rigLight = new THREE.PointLight(0x55e7df, 1.2, 4.5);
  rigLight.position.set(0, 1.25, -0.4);
  playerRoot.add(rigLight);
  world.roverModel = model;
}

function installDroneModels(source) {
  markRenderable(source);
  fitAsset(source, 1.7);
  HAZARDS.forEach((hazard, index) => {
    const drone = source.clone(true);
    drone.position.set(hazard.position.x + (index - 1) * 1.5, 2.2 + index * 0.35, hazard.position.z);
    drone.userData.baseY = drone.position.y;
    worldRoot.add(drone);
    world.drones.push(drone);
  });
}

function fitAsset(object, targetSize) {
  object.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 0.001);
  object.scale.multiplyScalar(targetSize / largest);
  object.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.x -= center.x;
  object.position.z -= center.z;
  object.position.y -= box.min.y;
}

function bindInput() {
  window.addEventListener('resize', resize);
  window.addEventListener('blur', () => {
    keys.clear();
    if (phase === 'playing') setPaused(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'playing') setPaused(true);
  });

  window.addEventListener('keydown', (event) => {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
      if (event.code !== 'KeyE' && !event.repeat) {
        moveTarget = null;
        autoRepairTarget = null;
        if (world.clickMarker) world.clickMarker.visible = false;
      }
    }
    if (event.repeat) return;
    if (event.code === 'KeyQ' && phase === 'playing' && !paused) runScan();
    if (event.code === 'KeyC' && phase === 'playing' && !paused) consumeCoolant();
    if (event.code === 'Escape' && (phase === 'playing' || paused)) setPaused(!paused);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));

  ui.canvas.addEventListener('pointerdown', handleWorldPointer);
  ui.start.addEventListener('click', beginShift);
  ui.restart.addEventListener('click', restartShift);
  ui.pauseButton.addEventListener('click', () => setPaused(true));
  ui.resume.addEventListener('click', () => setPaused(false));
  ui.audio.addEventListener('click', toggleAudio);
}

function handleWorldPointer(event) {
  if (phase !== 'playing' || paused) return;
  const bounds = ui.canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
    -((event.clientY - bounds.top) / bounds.height) * 2 + 1
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const point = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point)) return;
  point.x = THREE.MathUtils.clamp(point.x, DISTRICT_CONFIG.bounds.minX, DISTRICT_CONFIG.bounds.maxX);
  point.z = THREE.MathUtils.clamp(point.z, DISTRICT_CONFIG.bounds.minZ, DISTRICT_CONFIG.bounds.maxZ);

  const nearest = REPAIR_NODES.reduce((best, node) => {
    const distance = Math.hypot(point.x - node.position.x, point.z - node.position.z);
    return distance < best.distance ? { node, distance } : best;
  }, { node: null, distance: Infinity });
  if (nearest.distance <= 2.3 && state.repairs[nearest.node.id]?.status !== 'repaired') {
    moveTarget = new THREE.Vector3(nearest.node.position.x, 0, nearest.node.position.z);
    autoRepairTarget = nearest.node.id;
  } else {
    moveTarget = new THREE.Vector3(point.x, 0, point.z);
    autoRepairTarget = null;
  }
  world.clickMarker.position.set(moveTarget.x, 0.035, moveTarget.z);
  world.clickMarker.visible = true;
}

function beginShift() {
  if (phase !== 'briefing') return;
  startShift(state);
  phase = 'playing';
  ui.shell.dataset.phase = 'playing';
  ui.boot.classList.remove('is-visible');
  ui.boot.setAttribute('aria-hidden', 'true');
  ui.start.blur();
  ui.canvas.focus({ preventScroll: true });
  lastTime = performance.now();
  showToast('<b>SHIFT STARTED</b> // LOCATE OPEN WORK ORDERS');
  playTone(420, 0.12, 'triangle');
  setTimeout(() => {
    if (phase === 'playing' && !introHintShown) {
      showToast('TIP // CLICK OR TAP A MARKER TO AUTO-NAVIGATE');
      introHintShown = true;
    }
  }, 3200);
}

function restartShift() {
  state = createGameState();
  startShift(state);
  playerPosition.set(DISTRICT_CONFIG.playerStart.x, 0, DISTRICT_CONFIG.playerStart.z);
  playerVelocity.set(0, 0, 0);
  playerRoot.position.copy(playerPosition);
  playerRoot.rotation.set(0, 0, 0);
  moveTarget = null;
  autoRepairTarget = null;
  paused = false;
  phase = 'playing';
  ui.shell.dataset.phase = 'playing';
  ui.result.hidden = true;
  ui.result.setAttribute('aria-hidden', 'true');
  ui.result.classList.remove('is-visible');
  ui.pause.hidden = true;
  world.repairs.forEach((group) => resetRepairVisual(group));
  world.caches.forEach((group) => {
    group.visible = true;
    group.userData.collected = false;
  });
  if (world.clickMarker) world.clickMarker.visible = false;
  lastTime = performance.now();
  updateUI();
  ui.canvas.focus({ preventScroll: true });
  showToast('<b>NEW SHIFT</b> // SYSTEMS RESET');
}

function setPaused(next) {
  if (phase !== 'playing' && !paused) return;
  paused = next;
  ui.pause.hidden = !paused;
  ui.pause.setAttribute('aria-hidden', String(!paused));
  ui.shell.dataset.phase = paused ? 'paused' : 'playing';
  ui.pauseButton.textContent = paused ? '▶' : 'Ⅱ';
  if (paused) {
    keys.clear();
    ui.resume.focus({ preventScroll: true });
  } else {
    lastTime = performance.now();
    ui.canvas.focus({ preventScroll: true });
  }
}

function toggleAudio() {
  audioEnabled = !audioEnabled;
  ui.audio.setAttribute('aria-pressed', String(audioEnabled));
  ui.audio.setAttribute('aria-label', audioEnabled ? '음향 끄기' : '음향 켜기');
  ui.audio.querySelector('small').textContent = audioEnabled ? 'SFX ON' : 'SFX OFF';
  ui.audio.querySelector('b').textContent = audioEnabled ? '◖))' : '◖';
  if (audioEnabled) {
    audioContext ??= new AudioContext();
    audioContext.resume();
    playTone(620, 0.08, 'sine');
  }
}

function playTone(frequency, duration = 0.1, type = 'sine', volume = 0.035) {
  if (!audioEnabled || !audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function runScan() {
  const event = triggerScan(state);
  if (!event) {
    showToast(state.scan.cooldown > 0 ? `SCAN RECHARGING // ${state.scan.cooldown.toFixed(1)}S` : 'INSUFFICIENT CHARGE');
    playTone(150, 0.11, 'square', 0.02);
    return;
  }
  processEvent(event);
}

function consumeCoolant() {
  const event = useCoolant(state);
  if (!event) {
    showToast(state.inventory.coolant <= 0 ? 'NO COOLANT REMAINING' : 'COOLANT NOT REQUIRED');
    return;
  }
  processEvent(event);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  elapsedVisual += dt;

  if (phase === 'playing' && !paused) updateGame(dt);
  updateWorldVisuals(dt);
  updateCamera(dt);
  drawRadar();
  renderer.render(scene, camera);
}

function updateGame(dt) {
  const movement = getMovement(dt);
  const wantsRepair = keys.has('KeyE') || (
    autoRepairTarget
    && state.interaction.targetId === autoRepairTarget
    && playerVelocity.lengthSq() < 0.08
  );
  const result = tickGame(state, {
    position: { x: playerPosition.x, z: playerPosition.z },
    repairing: wantsRepair,
    sprinting: movement.sprinting
  }, dt);
  result.events.forEach(processEvent);
  updateUI(result.objective, result.interaction);

  if (state.phase === 'won' || state.phase === 'lost') finishGame(state.phase);
}

function getMovement(dt) {
  const input = new THREE.Vector2(
    Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
    Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp'))
  );
  let desired = new THREE.Vector3();
  let usesKeyboard = input.lengthSq() > 0;
  if (usesKeyboard) {
    input.normalize();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    desired.addScaledVector(right, input.x).addScaledVector(forward, -input.y).normalize();
  } else if (moveTarget) {
    desired.copy(moveTarget).sub(playerPosition);
    desired.y = 0;
    const distance = desired.length();
    if (distance < 0.3) {
      moveTarget = null;
      world.clickMarker.visible = false;
      desired.set(0, 0, 0);
    } else desired.normalize();
  }

  const sprinting = usesKeyboard
    && (keys.has('ShiftLeft') || keys.has('ShiftRight'))
    && state.player.energy > 1;
  const speed = sprinting ? 7.2 : 4.25;
  desired.multiplyScalar(speed);
  const response = 1 - Math.exp(-dt * (desired.lengthSq() ? 12 : 8));
  playerVelocity.lerp(desired, response);
  playerPosition.addScaledVector(playerVelocity, dt);
  playerPosition.x = THREE.MathUtils.clamp(playerPosition.x, DISTRICT_CONFIG.bounds.minX, DISTRICT_CONFIG.bounds.maxX);
  playerPosition.z = THREE.MathUtils.clamp(playerPosition.z, DISTRICT_CONFIG.bounds.minZ, DISTRICT_CONFIG.bounds.maxZ);
  playerRoot.position.x = playerPosition.x;
  playerRoot.position.z = playerPosition.z;
  if (playerVelocity.lengthSq() > 0.1) {
    const targetAngle = Math.atan2(playerVelocity.x, playerVelocity.z);
    playerRoot.rotation.y = dampAngle(playerRoot.rotation.y, targetAngle, 12, dt);
  }
  playerRoot.position.y = Math.sin(elapsedVisual * 9) * Math.min(0.025, playerVelocity.length() * 0.004);
  return { sprinting };
}

function dampAngle(current, target, lambda, dt) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + difference * (1 - Math.exp(-lambda * dt));
}

function processEvent(event) {
  if (!event) return;
  switch (event.type) {
    case 'repair-started':
      playTone(260, 0.06, 'square', 0.018);
      break;
    case 'repair-completed':
      setRepairCompleted(event.repairId);
      autoRepairTarget = null;
      showToast(`<b>${event.label.toUpperCase()} ONLINE</b> // +${event.score}`);
      playTone(540, 0.16, 'triangle');
      setTimeout(() => playTone(760, 0.22, 'sine'), 100);
      break;
    case 'system-unlocked':
      showToast(`<b>WORK ORDER UNLOCKED</b> // ${event.label.toUpperCase()}`);
      break;
    case 'repair-blocked':
      autoRepairTarget = null;
      showToast(blockedMessage(event.reason));
      playTone(120, 0.12, 'square', 0.018);
      break;
    case 'cache-collected':
      world.caches.get(event.cacheId).visible = false;
      showToast(`<b>SALVAGE SECURED</b> // +${event.reward.cells} CELL${event.reward.coolant ? ` +${event.reward.coolant} COOLANT` : ''}`);
      playTone(690, 0.09, 'sine');
      break;
    case 'hazard-entered':
      showToast(`<b>WARNING</b> // ${event.label.toUpperCase()}`);
      playTone(90, 0.2, 'sawtooth', 0.025);
      break;
    case 'player-overheated':
      showToast('<b>RIG OVERHEATED</b> // PRESS C FOR COOLANT');
      break;
    case 'energy-depleted':
      showToast('<b>CHARGE DEPLETED</b> // RELEASE BOOST');
      break;
    case 'wave-started':
      showToast(`<b>${event.label}</b> // SEEK CLEAR GROUND`);
      ui.shell.classList.add('surge');
      playTone(72, 0.45, 'sawtooth', 0.03);
      break;
    case 'wave-ended':
      showToast(`<b>ION SURGE PASSED</b> // +${event.score}`);
      ui.shell.classList.remove('surge');
      break;
    case 'scan-triggered':
      spawnScanWave();
      showToast(`<b>AREA SCANNED</b> // ${event.repairIds.length} WORK ORDERS`);
      playTone(880, 0.3, 'sine', 0.025);
      break;
    case 'coolant-used':
      showToast(`<b>COOLANT INJECTED</b> // HEAT ${Math.round(event.heat)}%`);
      playTone(350, 0.16, 'sine');
      break;
    default:
      break;
  }
}

function blockedMessage(reason) {
  const messages = {
    dependency: 'WORK ORDER LOCKED // RESTORE PREREQUISITES',
    cells: 'INSUFFICIENT FLUX CELLS // FIND SALVAGE',
    coolant: 'COOLANT REQUIRED // FIND SALVAGE',
    heat: 'RIG OVERHEATED // PRESS C',
    energy: 'INSUFFICIENT CHARGE'
  };
  return messages[reason] ?? 'REPAIR LINK INTERRUPTED';
}

function setRepairCompleted(id) {
  const group = world.repairs.get(id);
  if (!group) return;
  group.userData.repaired = true;
  group.userData.core.material.color.setHex(0x65e4d9);
  group.userData.core.material.emissive.setHex(0x147f83);
  group.userData.core.material.emissiveIntensity = 1.7;
  group.userData.halo.material.color.setHex(0x65e4d9);
  group.userData.beacon.color.setHex(0x65e4d9);
  group.userData.beacon.intensity = 1.25;
}

function resetRepairVisual(group) {
  group.userData.repaired = false;
  group.userData.core.material.color.setHex(0xe84a45);
  group.userData.core.material.emissive.setHex(0x7a1111);
  group.userData.core.material.emissiveIntensity = 1.5;
  group.userData.halo.material.color.setHex(0xff684f);
  group.userData.beacon.color.setHex(0xff493c);
  group.userData.beacon.intensity = 1.1;
}

function spawnScanWave() {
  if (world.scanWave) worldRoot.remove(world.scanWave);
  const wave = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 0.82, 72),
    new THREE.MeshBasicMaterial({ color: 0x65eee7, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
  );
  wave.rotation.x = -Math.PI / 2;
  wave.position.set(playerPosition.x, 0.13, playerPosition.z);
  wave.userData.life = 0;
  worldRoot.add(wave);
  world.scanWave = wave;
}

function updateWorldVisuals(dt) {
  world.repairs.forEach((group, id) => {
    const data = group.userData;
    data.core.rotation.y += dt * (data.repaired ? 1.1 : 2.4);
    data.core.position.y = 2.15 + Math.sin(elapsedVisual * 2.5 + group.position.x) * 0.08;
    data.halo.rotation.z += dt * (data.repaired ? 0.2 : 0.7);
    const repair = state.repairs[id];
    const locked = repair?.status === 'locked';
    data.label.material.opacity = locked ? 0.25 : 0.9;
    if (state.scan.activeRemaining > 0 && repair?.status !== 'repaired') {
      data.halo.scale.setScalar(1 + Math.sin(elapsedVisual * 8) * 0.13);
      data.label.material.opacity = 1;
    } else data.halo.scale.setScalar(1);
  });

  world.hazards.forEach((group, id) => {
    const data = group.userData;
    const surge = state.wave.active ? 1 + state.wave.intensity * 0.22 : 1;
    data.edge.scale.setScalar(surge + Math.sin(elapsedVisual * 3.4 + group.position.x) * 0.05);
    data.edge.material.opacity = 0.45 + Math.sin(elapsedVisual * 4.2) * 0.16;
    data.fault.rotation.y += dt * (id === 'arc_fault' ? 2.2 : 0.8);
    data.fault.children.forEach((shard, index) => {
      shard.position.y += Math.sin(elapsedVisual * 4 + index) * dt * 0.09;
      shard.rotation.x += dt * (0.4 + index * 0.1);
    });
  });

  world.caches.forEach((group, id) => {
    if (!group.visible || state.caches[id]?.collected) return;
    group.rotation.y += dt * 0.25;
    group.position.y = Math.sin(elapsedVisual * 2.2 + group.position.x) * 0.07;
    group.userData.light.intensity = 0.55 + Math.sin(elapsedVisual * 3.5) * 0.18;
  });

  world.drones.forEach((drone, index) => {
    drone.rotation.y += dt * (0.7 + index * 0.13);
    drone.position.y = drone.userData.baseY + Math.sin(elapsedVisual * 1.8 + index) * 0.32;
  });
  world.particles.forEach((particles) => {
    particles.rotation.y += dt * 0.008;
    particles.position.y = Math.sin(elapsedVisual * 0.22) * 0.1;
  });
  if (world.clickMarker?.visible) {
    world.clickMarker.rotation.y -= dt * 1.4;
    world.clickMarker.scale.setScalar(1 + Math.sin(elapsedVisual * 6) * 0.1);
  }
  if (world.scanWave) {
    world.scanWave.userData.life += dt;
    const life = world.scanWave.userData.life;
    world.scanWave.scale.setScalar(1 + life * 11);
    world.scanWave.material.opacity = Math.max(0, 0.82 - life * 0.52);
    if (life > 1.65) {
      worldRoot.remove(world.scanWave);
      world.scanWave.geometry.dispose();
      world.scanWave.material.dispose();
      world.scanWave = null;
    }
  }

  const hazardTint = state.player.inHazard ? 0.9 : 0;
  scene.fog.color.lerp(new THREE.Color(state.wave.active ? 0x1e1617 : 0x071012), 1 - Math.exp(-dt * (0.6 + hazardTint)));
  keyLight.intensity = 2.65 + Math.sin(elapsedVisual * 9) * (state.wave.active ? 0.22 : 0.02);
}

function updateCamera(dt) {
  cameraTarget.set(playerPosition.x * 0.14, 0, playerPosition.z * 0.14);
  const desiredPosition = cameraTarget.clone().add(cameraOffset);
  const damping = 1 - Math.exp(-dt * 2.2);
  camera.position.lerp(desiredPosition, damping);
  camera.lookAt(cameraTarget);
}

function updateUI(objective = getObjective(state), interaction = state.interaction) {
  ui.clock.textContent = formatTime(state.timeRemaining);
  ui.clock.classList.toggle('urgent', state.timeRemaining <= 30);
  ui.orderIndex.textContent = `${String(Math.min(state.repairCount + 1, REPAIR_NODES.length)).padStart(2, '0')} / ${String(REPAIR_NODES.length).padStart(2, '0')}`;
  ui.objectiveTitle.textContent = objective.title;
  ui.objectiveCopy.textContent = objective.detail;
  ui.repairCount.textContent = `${state.repairCount} / ${REPAIR_NODES.length}`;
  ui.score.textContent = String(Math.round(state.score)).padStart(4, '0');
  ui.integrity.textContent = String(Math.ceil(state.player.integrity));
  ui.energy.textContent = String(Math.ceil(state.player.energy));
  ui.cells.textContent = String(state.inventory.cells).padStart(2, '0');
  ui.coolant.textContent = String(state.inventory.coolant).padStart(2, '0');
  updateMeter(ui.integrityMeter, state.player.integrity, '내구도');
  updateMeter(ui.energyMeter, state.player.energy, '충전량');

  const rigState = state.player.overheated
    ? 'OVERHEAT'
    : state.player.inHazard
      ? 'DANGER'
      : state.player.integrity < 35
        ? 'CRITICAL'
        : 'NOMINAL';
  ui.rigState.textContent = rigState;
  ui.rigState.style.color = rigState === 'NOMINAL' ? 'var(--cyan)' : 'var(--danger)';

  const activeRepair = state.player.repairing
    ? state.repairs[state.player.repairing]
    : interaction?.targetId
      ? state.repairs[interaction.targetId]
      : null;
  const progress = activeRepair?.progress ?? 0;
  ui.objectiveProgress.style.width = `${Math.round(progress * 100)}%`;
  ui.repairRing.style.strokeDashoffset = String(119.4 * (1 - progress));

  const hasInteraction = phase === 'playing' && interaction?.type === 'repair';
  ui.interaction.hidden = !hasInteraction;
  if (hasInteraction) {
    const node = repairLookup[interaction.targetId];
    const blocked = interaction.blockedReason;
    ui.interactionTitle.textContent = blocked ? 'REPAIR BLOCKED' : 'HOLD E TO REPAIR';
    ui.interactionDetail.textContent = blocked
      ? blockedMessage(blocked).split('//').pop().trim()
      : `${node.shortLabel} // ${Math.round(progress * 100)}%`;
  }
}

function updateMeter(element, value, label) {
  const safeValue = THREE.MathUtils.clamp(value, 0, 100);
  element.querySelectorAll('i').forEach((segment, index) => segment.classList.toggle('on', index < Math.ceil(safeValue / 10)));
  element.setAttribute('role', 'progressbar');
  element.setAttribute('aria-valuemin', '0');
  element.setAttribute('aria-valuemax', '100');
  element.setAttribute('aria-valuenow', String(Math.round(safeValue)));
  element.setAttribute('aria-valuetext', `${label} ${Math.round(safeValue)}퍼센트`);
}

function drawRadar() {
  const context = ui.radar.getContext('2d');
  const width = ui.radar.width;
  const height = ui.radar.height;
  const center = width / 2;
  const radius = width * 0.43;
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(center, center);
  context.strokeStyle = 'rgba(102, 220, 214, .24)';
  context.lineWidth = 1;
  for (const scale of [0.33, 0.66, 1]) {
    context.beginPath();
    context.arc(0, 0, radius * scale, 0, Math.PI * 2);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(-radius, 0);
  context.lineTo(radius, 0);
  context.moveTo(0, -radius);
  context.lineTo(0, radius);
  context.stroke();

  const project = (position) => ({
    x: ((position.x - playerPosition.x) / 36) * radius * 2,
    y: ((position.z - playerPosition.z) / 36) * radius * 2
  });
  context.beginPath();
  context.arc(0, 0, 3.5, 0, Math.PI * 2);
  context.fillStyle = '#ecf5e9';
  context.fill();

  for (const node of REPAIR_NODES) {
    if (state.repairs[node.id].status === 'repaired') continue;
    const point = project(node.position);
    if (Math.hypot(point.x, point.y) > radius) continue;
    context.save();
    context.translate(point.x, point.y);
    context.rotate(Math.PI / 4);
    context.fillStyle = state.repairs[node.id].status === 'locked' ? 'rgba(142,160,155,.55)' : '#ffbd58';
    context.fillRect(-3, -3, 6, 6);
    context.restore();
  }
  for (const hazard of HAZARDS) {
    const point = project(hazard.position);
    if (Math.hypot(point.x, point.y) > radius) continue;
    context.beginPath();
    context.arc(point.x, point.y, 2.5, 0, Math.PI * 2);
    context.fillStyle = '#ef4e54';
    context.fill();
  }
  if (state.scan.activeRemaining > 0) {
    context.beginPath();
    const pulse = radius * (1 - state.scan.activeRemaining / DISTRICT_CONFIG.scanDuration);
    context.arc(0, 0, Math.max(2, pulse), 0, Math.PI * 2);
    context.strokeStyle = `rgba(110,233,228,${state.scan.activeRemaining / DISTRICT_CONFIG.scanDuration})`;
    context.lineWidth = 2;
    context.stroke();
  }
  context.restore();
}

function finishGame(outcome) {
  if (phase === 'result') return;
  phase = 'result';
  paused = false;
  ui.shell.dataset.phase = 'result';
  ui.result.hidden = false;
  ui.result.setAttribute('aria-hidden', 'false');
  requestAnimationFrame(() => ui.result.classList.add('is-visible'));
  const won = outcome === 'won';
  ui.resultKicker.textContent = won ? 'SHIFT COMPLETE' : 'SHIFT TERMINATED';
  ui.resultTitle.innerHTML = won ? 'DISTRICT<br>STABILIZED' : 'SERVICE<br>INTERRUPTED';
  ui.resultCopy.textContent = won
    ? '전력망이 다시 연결되었습니다. 다음 궤도까지 수리 지구가 유지됩니다.'
    : state.outcome === 'timeout'
      ? '서비스 창이 닫혔습니다. 동선을 다시 계획해 남은 설비를 복구하세요.'
      : '필드 리그가 작동 한계를 넘었습니다. 위험 구역과 과열을 관리하세요.';
  ui.resultRepairs.textContent = `${state.repairCount} / ${REPAIR_NODES.length}`;
  ui.resultScore.textContent = String(Math.round(state.score)).padStart(4, '0');
  ui.resultTime.textContent = formatTime(state.timeRemaining);
  ui.restart.focus({ preventScroll: true });
  playTone(won ? 620 : 110, 0.5, won ? 'sine' : 'sawtooth', 0.035);
}

function showToast(html) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = html;
  ui.toasts.append(toast);
  window.setTimeout(() => toast.classList.add('out'), 2600);
  window.setTimeout(() => toast.remove(), 3000);
}

function resize() {
  const width = Math.max(1, ui.canvas.clientWidth);
  const height = Math.max(1, ui.canvas.clientHeight);
  const aspect = width / height;
  const viewHeight = aspect < 1 ? 22 : 18;
  camera.left = (-viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function mulberry32(seed) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
