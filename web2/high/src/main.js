import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HAZARDS, RELAYS, SCRAP, createGameState, formatTime, nearestRelay, tickState, usePulse } from './game-core.js';

const mount = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
mount.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071616);
scene.fog = new THREE.FogExp2(0x071616, 0.025);

const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 100);
const cameraOffset = new THREE.Vector3(15.5, 18, 15.5);
camera.position.copy(cameraOffset);

scene.add(new THREE.HemisphereLight(0x9eeadd, 0x17201e, 1.6));
const keyLight = new THREE.DirectionalLight(0xffdfaa, 3.4);
keyLight.position.set(-8, 18, 10);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -20;
keyLight.shadow.camera.right = 20;
keyLight.shadow.camera.top = 20;
keyLight.shadow.camera.bottom = -20;
scene.add(keyLight);

const rimLight = new THREE.PointLight(0x44d8c7, 32, 24, 2);
rimLight.position.set(5, 6, -5);
scene.add(rimLight);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(34, 34),
  new THREE.MeshPhysicalMaterial({ color: 0x0b302e, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.44 })
);
water.rotation.x = -Math.PI / 2;
water.position.y = 0.08;
water.receiveShadow = true;
scene.add(water);

const grid = new THREE.GridHelper(34, 34, 0x3ca99b, 0x173b38);
grid.position.y = 0.1;
grid.material.opacity = 0.13;
grid.material.transparent = true;
scene.add(grid);

const groundTarget = new THREE.Mesh(
  new THREE.PlaneGeometry(32, 32),
  new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
);
groundTarget.rotation.x = -Math.PI / 2;
groundTarget.position.y = 0.25;
scene.add(groundTarget);

const loader = new GLTFLoader();
const [districtGltf, droneGltf] = await Promise.all([
  loader.loadAsync('./models/repair-district.gltf'),
  loader.loadAsync('./models/mender-drone.gltf')
]);

const district = districtGltf.scene;
district.traverse((object) => {
  if (!object.isMesh) return;
  object.castShadow = true;
  object.receiveShadow = true;
});
scene.add(district);

const drone = droneGltf.scene;
drone.position.set(-10, 0.78, 9);
drone.rotation.y = Math.PI * 0.25;
drone.scale.setScalar(0.9);
drone.traverse((object) => {
  if (!object.isMesh) return;
  object.castShadow = true;
  object.receiveShadow = true;
});
scene.add(drone);

const beaconGroup = new THREE.Group();
const relayVisuals = new Map();
const beaconGeometry = new THREE.OctahedronGeometry(0.32, 0);
const ringGeometry = new THREE.TorusGeometry(0.58, 0.025, 8, 32);
for (const relay of RELAYS) {
  const group = new THREE.Group();
  const glowMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0a83e,
    emissive: 0xff8b1f,
    emissiveIntensity: 4,
    roughness: 0.35,
    metalness: 0.4
  });
  const core = new THREE.Mesh(beaconGeometry, glowMaterial);
  core.position.y = 2.35;
  const ring = new THREE.Mesh(ringGeometry, glowMaterial.clone());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.15;
  const light = new THREE.PointLight(0xff9b32, 8, 5, 2);
  light.position.y = 2.2;
  group.add(core, ring, light);
  group.position.set(relay.x, 0, relay.z);
  group.userData = { core, ring, light, repaired: false };
  relayVisuals.set(relay.id, group);
  beaconGroup.add(group);
}
scene.add(beaconGroup);

const scrapVisuals = new Map();
for (const scrap of SCRAP) {
  const material = new THREE.MeshStandardMaterial({ color: 0x77ead8, emissive: 0x1d9d8c, emissiveIntensity: 2, metalness: 0.8, roughness: 0.25 });
  const mesh = new THREE.Mesh(new THREE.TetrahedronGeometry(0.27, 0), material);
  mesh.position.set(scrap.x, 0.55, scrap.z);
  mesh.rotation.set(0.4, 0.4, 0.1);
  mesh.castShadow = true;
  scrapVisuals.set(scrap.id, mesh);
  scene.add(mesh);
}

const hazardVisuals = [];
for (const hazard of HAZARDS) {
  const material = new THREE.MeshBasicMaterial({ color: 0xff5a38, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(hazard.radius, 40), material);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(hazard.x, 0.14, hazard.z);
  const rim = new THREE.Mesh(new THREE.RingGeometry(hazard.radius * 0.82, hazard.radius, 40), material.clone());
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.03;
  pool.add(rim);
  hazardVisuals.push(pool);
  scene.add(pool);
}

const rainCount = 650;
const rainPositions = new Float32Array(rainCount * 3);
for (let i = 0; i < rainCount; i += 1) {
  rainPositions[i * 3] = (Math.random() - 0.5) * 42;
  rainPositions[i * 3 + 1] = Math.random() * 16;
  rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 42;
}
const rainGeometry = new THREE.BufferGeometry();
rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
const rain = new THREE.Points(rainGeometry, new THREE.PointsMaterial({ color: 0xa9ddd8, size: 0.025, transparent: true, opacity: 0.35 }));
scene.add(rain);

let state = createGameState();
const keys = new Set();
const moveTarget = new THREE.Vector3().copy(drone.position);
let hasMoveTarget = false;
let cameraWide = false;
let soundEnabled = true;
let audioContext = null;
let toastTimer = null;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const ui = {
  loading: document.querySelector('#loading'),
  briefing: document.querySelector('#briefing'),
  completion: document.querySelector('#completion'),
  start: document.querySelector('#startButton'),
  restart: document.querySelector('#restartButton'),
  repairCount: document.querySelector('#repairCount'),
  progressBar: document.querySelector('#progressBar'),
  objectiveTitle: document.querySelector('#objectiveTitle'),
  objectiveText: document.querySelector('#objectiveText'),
  energyBar: document.querySelector('#energyBar'),
  energyValue: document.querySelector('#energyValue'),
  scrapBar: document.querySelector('#scrapBar'),
  scrapValue: document.querySelector('#scrapValue'),
  radarPlayer: document.querySelector('#radarPlayer'),
  repairPrompt: document.querySelector('#repairPrompt'),
  repairRing: document.querySelector('#repairRing'),
  soundButton: document.querySelector('#soundButton'),
  cameraButton: document.querySelector('#cameraButton'),
  toast: document.querySelector('#toast'),
  completionStats: document.querySelector('#completionStats')
};

function showToast(message) {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1500);
}

function tone(frequency = 420, duration = 0.08, type = 'sine', volume = 0.04) {
  if (!soundEnabled) return;
  audioContext ??= new AudioContext();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  gain.gain.setValueAtTime(volume, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function setRelayRepaired(id) {
  const visual = relayVisuals.get(id);
  if (!visual) return;
  visual.userData.repaired = true;
  const { core, ring, light } = visual.userData;
  core.material.color.setHex(0x71ebd5);
  core.material.emissive.setHex(0x23c9b2);
  ring.material.color.setHex(0x71ebd5);
  ring.material.emissive.setHex(0x23c9b2);
  light.color.setHex(0x46f3d7);
  light.intensity = 15;
  showToast(`RELAY ${state.repaired.size} RESTORED`);
  tone(540, 0.24, 'triangle', 0.08);
  setTimeout(() => tone(760, 0.28, 'sine', 0.05), 110);
}

function updateUi() {
  const repaired = state.repaired.size;
  ui.repairCount.textContent = `${repaired} / ${RELAYS.length}`;
  ui.progressBar.style.width = `${(repaired / RELAYS.length) * 100}%`;
  ui.energyBar.style.width = `${state.energy}%`;
  ui.energyBar.style.background = state.energy < 25 ? 'var(--danger)' : 'var(--cyan)';
  ui.energyValue.textContent = Math.ceil(state.energy);
  ui.scrapBar.style.width = `${(state.scrap / SCRAP.length) * 100}%`;
  ui.scrapValue.textContent = state.scrap;
  ui.radarPlayer.style.left = `${THREE.MathUtils.clamp((drone.position.x + 14) / 28 * 100, 4, 96)}%`;
  ui.radarPlayer.style.top = `${THREE.MathUtils.clamp((drone.position.z + 14) / 28 * 100, 4, 96)}%`;
  const relay = nearestRelay(drone.position, state);
  ui.repairPrompt.classList.toggle('visible', Boolean(relay));
  ui.repairPrompt.setAttribute('aria-hidden', relay ? 'false' : 'true');
  ui.repairRing.style.setProperty('--repair', `${state.repairProgress * 100}%`);
  if (state.energy <= 0 && !state.complete) {
    ui.objectiveTitle.textContent = 'CELL DEPLETED';
    ui.objectiveText.textContent = 'Wait for reserve charge or collect nearby scrap.';
  } else {
    ui.objectiveTitle.textContent = repaired === 0 ? 'WAKE THE DISTRICT' : 'RESTORE THE SIGNAL CHAIN';
    ui.objectiveText.textContent = relay ? 'Relay in range — hold E to calibrate.' : 'Follow the amber beacons. Scrap restores energy.';
  }
}

function resetGame() {
  state = createGameState();
  state.started = true;
  drone.position.set(-10, 0.78, 9);
  moveTarget.copy(drone.position);
  hasMoveTarget = false;
  for (const [id, visual] of relayVisuals) {
    visual.userData.repaired = false;
    visual.userData.core.material.color.setHex(0xf0a83e);
    visual.userData.core.material.emissive.setHex(0xff8b1f);
    visual.userData.ring.material.color.setHex(0xf0a83e);
    visual.userData.ring.material.emissive.setHex(0xff8b1f);
    visual.userData.light.color.setHex(0xff9b32);
    visual.userData.light.intensity = 8;
    visual.visible = true;
  }
  for (const mesh of scrapVisuals.values()) mesh.visible = true;
  ui.completion.classList.remove('visible');
  ui.completion.setAttribute('aria-hidden', 'true');
  updateUi();
}

function pulse() {
  if (!usePulse(state)) return;
  tone(170, 0.4, 'sine', 0.06);
  const material = new THREE.MeshBasicMaterial({ color: 0x7cf9e4, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.48, 48), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(drone.position);
  mesh.position.y = 0.3;
  scene.add(mesh);
  const start = performance.now();
  function animatePulse(now) {
    const t = Math.min(1, (now - start) / 650);
    mesh.scale.setScalar(1 + t * 10);
    material.opacity = (1 - t) * 0.65;
    if (t < 1) requestAnimationFrame(animatePulse);
    else {
      scene.remove(mesh);
      material.dispose();
      mesh.geometry.dispose();
    }
  }
  requestAnimationFrame(animatePulse);
  const closest = RELAYS.filter((relay) => !state.repaired.has(relay.id)).sort((a, b) => {
    return Math.hypot(drone.position.x - a.x, drone.position.z - a.z) - Math.hypot(drone.position.x - b.x, drone.position.z - b.z);
  })[0];
  if (closest) showToast('PULSE: NEAREST RELAY MARKED');
}

function onPointer(event) {
  if (!state.started || state.complete || event.target !== renderer.domElement) return;
  pointer.x = (event.clientX / innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(groundTarget)[0];
  if (!hit) return;
  moveTarget.copy(hit.point);
  moveTarget.x = THREE.MathUtils.clamp(moveTarget.x, -13, 13);
  moveTarget.z = THREE.MathUtils.clamp(moveTarget.z, -13, 13);
  moveTarget.y = drone.position.y;
  hasMoveTarget = true;
}

renderer.domElement.addEventListener('pointerdown', onPointer);
addEventListener('keydown', (event) => {
  keys.add(event.key.toLowerCase());
  if (event.key.toLowerCase() === 'r' && !event.repeat) pulse();
});
addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
ui.start.addEventListener('click', () => {
  state.started = true;
  ui.briefing.classList.add('hidden');
  tone(330, 0.18, 'triangle', 0.05);
});
ui.restart.addEventListener('click', resetGame);
ui.soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  ui.soundButton.textContent = `SOUND / ${soundEnabled ? 'ON' : 'OFF'}`;
  if (soundEnabled) tone(520, 0.1);
});
ui.cameraButton.addEventListener('click', () => {
  cameraWide = !cameraWide;
  ui.cameraButton.textContent = `CAMERA / ${cameraWide ? 'WIDE' : 'FOLLOW'}`;
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
});

const clock = new THREE.Clock();
const movement = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (state.started && !state.complete) {
    movement.set(0, 0, 0);
    if (keys.has('w') || keys.has('arrowup')) movement.z -= 1;
    if (keys.has('s') || keys.has('arrowdown')) movement.z += 1;
    if (keys.has('a') || keys.has('arrowleft')) movement.x -= 1;
    if (keys.has('d') || keys.has('arrowright')) movement.x += 1;
    if (movement.lengthSq() > 0) {
      movement.normalize();
      hasMoveTarget = false;
    } else if (hasMoveTarget) {
      movement.copy(moveTarget).sub(drone.position);
      movement.y = 0;
      if (movement.length() < 0.2) {
        movement.set(0, 0, 0);
        hasMoveTarget = false;
      } else movement.normalize();
    }
    const speed = state.energy <= 0 ? 1.25 : 4.25;
    drone.position.addScaledVector(movement, speed * dt);
    drone.position.x = THREE.MathUtils.clamp(drone.position.x, -13, 13);
    drone.position.z = THREE.MathUtils.clamp(drone.position.z, -13, 13);
    drone.position.y = 0.78 + Math.sin(time * 4.2) * 0.07;
    if (movement.lengthSq() > 0) {
      const targetAngle = Math.atan2(movement.x, movement.z);
      drone.rotation.y = THREE.MathUtils.lerp(drone.rotation.y, targetAngle, dt * 9);
    }

    const result = tickState(state, drone.position, dt, keys.has('e'));
    if (result.repaired) setRelayRepaired(result.repaired);
    for (const id of result.collected) {
      scrapVisuals.get(id).visible = false;
      showToast('SALVAGE +1 / ENERGY RESTORED');
      tone(680, 0.12, 'triangle', 0.04);
    }
    if (state.complete) {
      ui.completionStats.textContent = `${formatTime(state.elapsed)} SHIFT · ${state.scrap} SALVAGE RECOVERED · ${Math.ceil(state.energy)}% CELL`;
      ui.completion.classList.add('visible');
      ui.completion.setAttribute('aria-hidden', 'false');
    }
    updateUi();
  }

  for (const [id, visual] of relayVisuals) {
    const offset = Number(id.slice(1));
    visual.userData.core.rotation.y += dt * (visual.userData.repaired ? 2.1 : 0.8);
    visual.userData.core.position.y = 2.35 + Math.sin(time * 2 + offset) * 0.12;
    visual.userData.ring.rotation.z += dt * (visual.userData.repaired ? 1.2 : 0.45);
    visual.userData.light.intensity *= 0.94;
    visual.userData.light.intensity += (visual.userData.repaired ? 15 : 8) * 0.06;
  }
  for (const [id, mesh] of scrapVisuals) {
    if (!mesh.visible) continue;
    mesh.rotation.y += dt * 1.5;
    mesh.position.y = 0.55 + Math.sin(time * 3 + Number(id.slice(1))) * 0.08;
  }
  hazardVisuals.forEach((mesh, index) => {
    mesh.material.opacity = 0.18 + Math.sin(time * 3 + index) * 0.05;
    mesh.rotation.z += dt * (index % 2 ? -0.08 : 0.08);
  });
  const rainArray = rain.geometry.attributes.position.array;
  for (let i = 1; i < rainArray.length; i += 3) {
    rainArray[i] -= dt * 4.2;
    if (rainArray[i] < 0) rainArray[i] = 16;
  }
  rain.geometry.attributes.position.needsUpdate = true;

  desiredCamera.copy(cameraWide ? new THREE.Vector3(21, 25, 21) : cameraOffset).add(cameraWide ? new THREE.Vector3() : drone.position);
  if (cameraWide) desiredCamera.y = 25;
  camera.position.lerp(desiredCamera, 1 - Math.exp(-dt * 2.6));
  const lookTarget = cameraWide ? new THREE.Vector3(0, 0, 0) : drone.position.clone().setY(0.4);
  camera.lookAt(lookTarget);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

ui.loading.classList.add('hidden');
updateUi();
animate();
