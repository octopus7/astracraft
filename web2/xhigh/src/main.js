import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  STATION_BLUEPRINTS,
  WORLD_BOUNDS,
  advanceRepair,
  clampToWorld,
  findNearestStation,
  formatDistrictTime,
  moveToward,
} from './game-core.js';

const viewport = document.querySelector('#viewport');
const loading = document.querySelector('#loading');
const loadingProgress = document.querySelector('#loading-progress');
const loadingDetail = document.querySelector('#loading-detail');
const clockLabel = document.querySelector('#clock');
const objectiveList = document.querySelector('#objectives');
const radar = document.querySelector('#radar');
const radarPlayer = document.querySelector('#radar-player');
const interaction = document.querySelector('#interaction');
const interactionLabel = document.querySelector('#interaction-label');
const interactionDistance = document.querySelector('#interaction-distance');
const holdProgress = document.querySelector('#hold-progress');
const toast = document.querySelector('#toast');
const soundButton = document.querySelector('#toggle-sound');

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111919);
scene.fog = new THREE.FogExp2(0x17201f, 0.023);

const camera = new THREE.OrthographicCamera(-18, 18, 11, -11, 0.1, 150);
camera.position.set(25, 28, 25);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
viewport.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.enablePan = true;
controls.screenSpacePanning = false;
controls.minZoom = 0.72;
controls.maxZoom = 2.5;
controls.zoomSpeed = 0.8;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minPolarAngle = Math.PI * 0.22;
controls.target.set(0, 0.2, 0);
controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;

const hemi = new THREE.HemisphereLight(0xa9c2bc, 0x18201b, 1.65);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xffe8c0, 4.1);
keyLight.position.set(-12, 27, 14);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -28;
keyLight.shadow.camera.right = 28;
keyLight.shadow.camera.top = 25;
keyLight.shadow.camera.bottom = -25;
keyLight.shadow.bias = -0.00025;
scene.add(keyLight);

const cyanLight = new THREE.PointLight(0x57d9df, 22, 15, 1.8);
cyanLight.position.set(-7, 5, -7);
scene.add(cyanLight);
const warmLight = new THREE.PointLight(0xff8d45, 30, 17, 1.9);
warmLight.position.set(7, 4.5, -6);
scene.add(warmLight);

const movePlane = new THREE.Mesh(
  new THREE.PlaneGeometry(44, 34),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
);
movePlane.rotation.x = -Math.PI / 2;
movePlane.position.y = 0.22;
scene.add(movePlane);

const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.42, 0.52, 24),
  new THREE.MeshBasicMaterial({ color: 0xe6c87d, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
);
marker.rotation.x = -Math.PI / 2;
marker.position.y = 0.25;
marker.visible = false;
scene.add(marker);

const rain = createRainField(reducedMotion ? 280 : 920);
scene.add(rain.points);

let district;
let player;
let stations = [];
let playerTarget = new THREE.Vector3(0, 0.78, 6.1);
let repairProgress = 0;
let activeStation = null;
let missionCompleteAnnounced = false;
let gameSeconds = 17 * 3600 + 42 * 60;
let lastToastTimer;
let soundscape;
const pressed = new Set();
const repairedIds = loadProgress();

const stationRadarDots = new Map();
for (const blueprint of STATION_BLUEPRINTS) {
  const dot = document.createElement('i');
  dot.className = `radar-station${repairedIds.has(blueprint.id) ? ' repaired' : ''}`;
  setRadarPosition(dot, blueprint.x, blueprint.z);
  radar.append(dot);
  stationRadarDots.set(blueprint.id, dot);
}
renderObjectives();

const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {
  const percentage = Math.max(12, Math.round((loaded / total) * 92));
  loadingProgress.style.width = `${percentage}%`;
};

const loader = new GLTFLoader(manager);
loader.load(
  './models/repair-district.gltf',
  (gltf) => {
    district = gltf.scene;
    district.name = 'CinderYardExport';
    district.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = !object.name.startsWith('Ground_');
      object.receiveShadow = true;
      if (object.material?.name === 'RepairDistrictAtlasPBR') object.material.envMapIntensity = 0.65;
    });
    scene.add(district);

    player = district.getObjectByName('CourierRig');
    if (!player) throw new Error('CourierRig node is missing from the glTF scene.');
    playerTarget.copy(player.position);
    setupStations();
    loadingProgress.style.width = '100%';
    loadingDetail.textContent = '구역 접속 완료';
    setTimeout(() => loading.classList.add('ready'), 260);
    showToast('FIELD LINK ESTABLISHED · 손상된 중계기에 접근하세요');
  },
  (event) => {
    if (event.total) loadingProgress.style.width = `${Math.min(88, (event.loaded / event.total) * 88)}%`;
  },
  (error) => {
    console.error(error);
    loadingDetail.textContent = '모델을 불러오지 못했습니다. 페이지를 새로고침하세요.';
    loadingProgress.style.width = '100%';
    loadingProgress.style.background = 'var(--danger)';
  },
);

function setupStations() {
  stations = STATION_BLUEPRINTS.map((blueprint) => {
    const group = district.getObjectByName(blueprint.nodeName);
    if (!group) throw new Error(`${blueprint.nodeName} node is missing from the glTF scene.`);
    const repaired = repairedIds.has(blueprint.id);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1.03, 36),
      new THREE.MeshBasicMaterial({
        color: repaired ? 0x70ddd1 : 0xd7644f,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(group.position.x, 0.25, group.position.z);
    scene.add(ring);

    const light = new THREE.PointLight(repaired ? 0x66ddd3 : 0xe7634c, 8, 6, 2);
    light.position.set(group.position.x, 1.25, group.position.z);
    scene.add(light);
    return { ...blueprint, group, ring, light, repaired, phase: Math.random() * Math.PI * 2 };
  });
}

function createRainField(count) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) resetRainDrop(positions, speeds, i, true);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xb6d4cf,
    size: 0.055,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { points: new THREE.Points(geometry, material), speeds };
}

function resetRainDrop(positions, speeds, index, randomY = false) {
  const offset = index * 3;
  positions[offset] = THREE.MathUtils.randFloat(-22, 22);
  positions[offset + 1] = randomY ? THREE.MathUtils.randFloat(0.5, 24) : THREE.MathUtils.randFloat(18, 25);
  positions[offset + 2] = THREE.MathUtils.randFloat(-18, 18);
  speeds[index] = THREE.MathUtils.randFloat(9, 17);
}

function updateRain(delta) {
  const positions = rain.points.geometry.attributes.position.array;
  for (let i = 0; i < rain.speeds.length; i += 1) {
    const offset = i * 3;
    positions[offset] += delta * 0.7;
    positions[offset + 1] -= rain.speeds[i] * delta;
    if (positions[offset + 1] < 0.2) resetRainDrop(positions, rain.speeds, i);
  }
  rain.points.geometry.attributes.position.needsUpdate = true;
}

function renderObjectives() {
  objectiveList.replaceChildren();
  for (const blueprint of STATION_BLUEPRINTS) {
    const item = document.createElement('li');
    item.className = repairedIds.has(blueprint.id) ? 'done' : '';
    item.dataset.stationId = blueprint.id;
    item.innerHTML = `<i aria-hidden="true"></i><span>${blueprint.label}</span>`;
    objectiveList.append(item);
  }
}

function repairStation(station) {
  station.repaired = true;
  repairedIds.add(station.id);
  station.ring.material.color.setHex(0x70ddd1);
  station.light.color.setHex(0x66ddd3);
  station.light.intensity = 15;
  stationRadarDots.get(station.id)?.classList.add('repaired');
  saveProgress();
  renderObjectives();
  playConfirmTone();
  showToast(`${station.label} · SIGNAL RESTORED`);
  repairProgress = 0;

  if (repairedIds.size === STATION_BLUEPRINTS.length && !missionCompleteAnnounced) {
    missionCompleteAnnounced = true;
    setTimeout(() => showToast('FIELD ORDER COMPLETE · CINDER YARD ONLINE'), 1200);
  }
}

function updatePlayer(delta) {
  if (!player) return;
  const input = new THREE.Vector2(
    Number(pressed.has('KeyD') || pressed.has('ArrowRight')) - Number(pressed.has('KeyA') || pressed.has('ArrowLeft')),
    Number(pressed.has('KeyS') || pressed.has('ArrowDown')) - Number(pressed.has('KeyW') || pressed.has('ArrowUp')),
  );

  if (input.lengthSq() > 0) {
    input.normalize();
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    const direction = forward.multiplyScalar(-input.y).add(right.multiplyScalar(input.x)).normalize();
    const bounded = clampToWorld({ x: player.position.x + direction.x * 7 * delta, z: player.position.z + direction.z * 7 * delta });
    playerTarget.set(bounded.x, player.position.y, bounded.z);
    player.position.x = bounded.x;
    player.position.z = bounded.z;
  } else {
    const next = moveToward(player.position, playerTarget, 5.3 * delta);
    player.position.x = next.x;
    player.position.z = next.z;
    if (next.arrived) marker.visible = false;
  }

  const dx = playerTarget.x - player.position.x;
  const dz = playerTarget.z - player.position.z;
  if (Math.hypot(dx, dz) > 0.04) {
    player.rotation.y = Math.atan2(dx, dz);
    player.position.y = 0.8 + Math.sin(performance.now() * 0.006) * 0.045;
  }

  setRadarPosition(radarPlayer, player.position.x, player.position.z);
}

function updateRepair(delta, elapsed) {
  if (!player || !stations.length) return;
  const nearest = findNearestStation(player.position, stations);
  const station = stations.find((candidate) => candidate.id === nearest.id);
  const inRange = nearest.distance < 2.15 && !station.repaired;
  const repairing = inRange && (pressed.has('KeyE') || pressed.has('Repair'));

  if (activeStation?.id !== station.id) repairProgress = 0;
  activeStation = station;
  repairProgress = advanceRepair(repairProgress, delta, repairing);

  interaction.hidden = !inRange;
  if (inRange) {
    interactionLabel.textContent = repairing ? '신호 동기화 중' : '길게 눌러 수리';
    interactionDistance.textContent = `${nearest.distance.toFixed(1)} m`;
    holdProgress.style.width = `${repairProgress * 100}%`;
  }

  for (const candidate of stations) {
    const pulse = candidate.repaired ? 0.65 : 0.5 + Math.sin(elapsed * 2.6 + candidate.phase) * 0.18;
    candidate.ring.material.opacity = pulse;
    candidate.ring.rotation.z += delta * (candidate.repaired ? 0.18 : 0.42);
    candidate.light.intensity = candidate.repaired ? 10 + Math.sin(elapsed * 1.5) * 2 : 6 + Math.sin(elapsed * 3 + candidate.phase) * 3;
  }

  if (repairProgress >= 1 && !station.repaired) repairStation(station);
}

function setRadarPosition(element, x, z) {
  const px = ((x - WORLD_BOUNDS.minX) / (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX)) * 100;
  const py = ((z - WORLD_BOUNDS.minZ) / (WORLD_BOUNDS.maxZ - WORLD_BOUNDS.minZ)) * 100;
  element.style.left = `${px}%`;
  element.style.top = `${py}%`;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerDown = null;

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY, button: event.button };
  ensureSoundStarted();
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerDown || pointerDown.button !== 0 || !player) return;
  const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDown = null;
  if (moved > 7) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(movePlane)[0];
  if (!hit) return;
  const bounded = clampToWorld(hit.point);
  playerTarget.set(bounded.x, player.position.y, bounded.z);
  marker.position.set(bounded.x, 0.25, bounded.z);
  marker.visible = true;
  playMoveTone();
});

addEventListener('keydown', (event) => {
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
    pressed.add(event.code);
    ensureSoundStarted();
  }
});

addEventListener('keyup', (event) => pressed.delete(event.code));
addEventListener('blur', () => pressed.clear());

const touchKeyMap = { forward: 'KeyW', left: 'KeyA', back: 'KeyS', right: 'KeyD' };
for (const button of document.querySelectorAll('[data-move]')) {
  const key = touchKeyMap[button.dataset.move];
  const release = () => pressed.delete(key);
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); pressed.add(key); ensureSoundStarted(); });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
}

const repairButton = document.querySelector('#touch-repair');
for (const eventName of ['pointerdown', 'touchstart']) repairButton.addEventListener(eventName, () => { pressed.add('Repair'); ensureSoundStarted(); }, { passive: true });
for (const eventName of ['pointerup', 'pointercancel', 'pointerleave', 'touchend']) repairButton.addEventListener(eventName, () => pressed.delete('Repair'), { passive: true });

document.querySelector('#center-camera').addEventListener('click', () => {
  if (!player) return;
  controls.target.set(player.position.x, 0, player.position.z);
  camera.position.set(player.position.x + 24, 27, player.position.z + 24);
  controls.update();
});

document.querySelector('#reset-mission').addEventListener('click', () => {
  repairedIds.clear();
  saveProgress();
  missionCompleteAnnounced = false;
  for (const station of stations) {
    station.repaired = false;
    station.ring.material.color.setHex(0xd7644f);
    station.light.color.setHex(0xe7634c);
    stationRadarDots.get(station.id)?.classList.remove('repaired');
  }
  renderObjectives();
  showToast('FIELD ORDER RESET');
});

soundButton.addEventListener('click', () => {
  if (!soundscape) {
    ensureSoundStarted();
    return;
  }
  soundscape.enabled = !soundscape.enabled;
  soundscape.master.gain.setTargetAtTime(soundscape.enabled ? 0.055 : 0, soundscape.context.currentTime, 0.08);
  soundButton.textContent = soundscape.enabled ? '◖' : '×';
  soundButton.setAttribute('aria-label', soundscape.enabled ? '환경음 끄기' : '환경음 켜기');
});

function ensureSoundStarted() {
  if (soundscape) {
    if (soundscape.context.state === 'suspended') soundscape.context.resume();
    return;
  }
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0.055;
  master.connect(context.destination);

  const low = context.createOscillator();
  low.type = 'sine';
  low.frequency.value = 47;
  const lowGain = context.createGain();
  lowGain.gain.value = 0.5;
  low.connect(lowGain).connect(master);
  low.start();

  const hum = context.createOscillator();
  hum.type = 'triangle';
  hum.frequency.value = 92;
  const humGain = context.createGain();
  humGain.gain.value = 0.12;
  hum.connect(humGain).connect(master);
  hum.start();
  soundscape = { context, master, enabled: true };
}

function playTone(frequency, duration, gain = 0.08) {
  if (!soundscape?.enabled) return;
  const { context, master } = soundscape;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';
  envelope.gain.setValueAtTime(gain, context.currentTime);
  envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.connect(envelope).connect(master);
  oscillator.start();
  oscillator.stop(context.currentTime + duration);
}

function playMoveTone() { playTone(230, 0.08, 0.055); }
function playConfirmTone() { playTone(620, 0.42, 0.18); setTimeout(() => playTone(930, 0.35, 0.12), 110); }

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(lastToastTimer);
  lastToastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function loadProgress() {
  try {
    const value = JSON.parse(localStorage.getItem('astracraft:xhigh:repaired') || '[]');
    return new Set(Array.isArray(value) ? value.filter((id) => STATION_BLUEPRINTS.some((station) => station.id === id)) : []);
  } catch {
    return new Set();
  }
}

function saveProgress() {
  try { localStorage.setItem('astracraft:xhigh:repaired', JSON.stringify([...repairedIds])); } catch { /* private mode */ }
}

function resize() {
  const aspect = innerWidth / innerHeight;
  const viewHeight = innerWidth < 700 ? 17 : 21;
  camera.left = (-viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.35 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
}

addEventListener('resize', resize);
resize();

const animationClock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = Math.min(animationClock.getDelta(), 0.05);
  const elapsed = animationClock.elapsedTime;
  gameSeconds += delta * 5;
  clockLabel.textContent = formatDistrictTime(gameSeconds);
  updatePlayer(delta);
  updateRepair(delta, elapsed);
  if (!reducedMotion) updateRain(delta);
  marker.material.opacity = 0.45 + Math.sin(elapsed * 5) * 0.25;
  marker.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.08);
  controls.update();
  renderer.render(scene, camera);
});
