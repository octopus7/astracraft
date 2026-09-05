import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';

const canvas = document.querySelector('#scene');
const loading = document.querySelector('#loading');
loading.querySelector('strong').textContent = '햇살을 준비하는 중';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e7d4e7');
scene.fog = new THREE.FogExp2('#ead8e4', .016);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
loading.querySelector('strong').textContent = '마을 모델을 불러오는 중';
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .94;

const camera = new THREE.OrthographicCamera(-14, 14, 10, -10, .1, 120);
const home = { position: new THREE.Vector3(22, 19, 27), target: new THREE.Vector3(0, 1.2, 0), zoom: 1 };
camera.position.copy(home.position);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(home.target);
controls.enableDamping = true;
controls.dampingFactor = .065;
controls.minZoom = .72;
controls.maxZoom = 2.25;
controls.maxPolarAngle = Math.PI * .47;
controls.minPolarAngle = Math.PI * .18;
controls.enablePan = false;
controls.autoRotate = !reducedMotion;
controls.autoRotateSpeed = .26;

scene.add(new THREE.HemisphereLight('#fff7e8', '#9d8bad', 1.45));
const sun = new THREE.DirectionalLight('#ffd7a2', 2.75);
sun.position.set(-13, 24, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.bias = -.0003;
scene.add(sun);
const fill = new THREE.DirectionalLight('#cfc4ff', .72);
fill.position.set(12, 9, -14);
scene.add(fill);

function createClouds() {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: '#fff0e3', transparent: true, opacity: .62, depthWrite: false });
  const geometry = new THREE.IcosahedronGeometry(1, 2);
  [[-18,14,-22,1.7],[13,16,-24,2.3],[22,10,-28,1.4],[-26,9,-25,1.25]].forEach(([x,y,z,s]) => {
    const group = new THREE.Group();
    [[0,0,1.4],[1.6,.2,1],[-1.5,.1,.9],[.1,.65,1.05]].forEach(([dx,dy,ss]) => {
      const cloud = new THREE.Mesh(geometry, material);
      cloud.position.set(dx*s, dy*s, 0);
      cloud.scale.set(1.35*s*ss, .72*s*ss, .75*s*ss);
      group.add(cloud);
    });
    group.position.set(x,y,z);
    root.add(group);
  });
  scene.add(root);
}
createClouds();

const floor = new THREE.Mesh(new THREE.CircleGeometry(27, 64), new THREE.ShadowMaterial({ color: '#7e6576', opacity: .13 }));
floor.position.y = -1.4;
floor.rotation.x = -Math.PI / 2;
floor.scale.y = .58;
floor.receiveShadow = true;
scene.add(floor);

const models = { low: null, detail: null };
const loader = new GLTFLoader();
let currentMode = 'detail';
let toastTimer;
const modeText = {
  low: { title: '로우폴리', description: '단순한 면과 가벼운 구성으로 또렷하게 표현합니다.' },
  detail: { title: '디테일', description: '지붕 타일과 돌, 꽃잎까지 풍성하게 표현합니다.' }
};

function toast(message) {
  const element = document.querySelector('#toast');
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 1700);
}

function addPuddleReflection(root, detail) {
  let marker = null;
  root.traverse(object => { if (object.name.startsWith('PuddleReflection')) marker = object; });
  if (marker) marker.visible = false;
  const size = detail ? 1280 : 640;
  const reflector = new Reflector(new THREE.CircleGeometry(3.15, detail ? 48 : 12), {
    clipBias: .004,
    textureWidth: Math.min(size, innerWidth * devicePixelRatio),
    textureHeight: Math.min(size, innerHeight * devicePixelRatio),
    color: detail ? 0x68aeb3 : 0x76a9aa,
    multisample: detail && devicePixelRatio > 1 ? 4 : 0
  });
  reflector.name = 'Live_Puddle_Reflection';
  reflector.position.set(-5.35, .415, 6.25);
  reflector.rotation.x = -Math.PI / 2;
  reflector.scale.set(1.28, .64, 1);
  reflector.renderOrder = 2;
  root.add(reflector);
}

function prepareModel(root, detail) {
  root.name = detail ? 'Blender_Detail_Village' : 'Blender_Lowpoly_Village';
  root.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = !object.name.includes('Water') && !object.name.includes('Puddle');
    object.receiveShadow = true;
    if (object.name.includes('Stream_Water') || object.name.includes('Well_Water')) {
      object.material.color.set(detail ? '#68b1b8' : '#78aeb1');
      object.material.roughness = .2;
      object.material.transparent = true;
      object.material.opacity = .86;
      object.material.depthWrite = false;
    }
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      material.envMapIntensity = detail ? .75 : .45;
      if (material.map) material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
  });
  addPuddleReflection(root, detail);
  return root;
}

async function loadModel(mode, url) {
  const gltf = await loader.loadAsync(url);
  loading.querySelector('strong').textContent = mode === 'low' ? '로우폴리 마을을 배치하는 중' : '꽃과 지붕을 다듬는 중';
  const root = prepareModel(gltf.scene, mode === 'detail');
  root.visible = mode === currentMode;
  models[mode] = root;
  scene.add(root);
}

function setMode(mode, announce = true) {
  if (!models[mode] || !models.low || !models.detail) {
    toast('모델을 불러오는 중이에요');
    return;
  }
  currentMode = mode;
  models.low.visible = mode === 'low';
  models.detail.visible = mode === 'detail';
  document.querySelector('#mode-title').textContent = modeText[mode].title;
  document.querySelector('#mode-description').textContent = modeText[mode].description;
  document.querySelectorAll('[data-mode]').forEach(button => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  renderer.toneMappingExposure = mode === 'detail' ? .94 : .88;
  if (announce) toast(mode === 'detail' ? '원본 무드로 전환했어요' : '로우폴리로 가볍게 전환했어요');
}

document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
document.querySelector('#reset').addEventListener('click', () => {
  camera.position.copy(home.position);
  camera.zoom = home.zoom;
  camera.updateProjectionMatrix();
  controls.target.copy(home.target);
  controls.update();
  toast('처음 시점으로 돌아왔어요');
});
document.querySelector('#auto-rotate').addEventListener('click', event => {
  controls.autoRotate = !controls.autoRotate;
  event.currentTarget.classList.toggle('active', controls.autoRotate);
  event.currentTarget.setAttribute('aria-pressed', String(controls.autoRotate));
  toast(controls.autoRotate ? '천천히 둘러볼게요' : '회전을 잠시 멈췄어요');
});
document.querySelector('#fullscreen').addEventListener('click', async () => {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
  else await document.exitFullscreen?.();
});
canvas.addEventListener('pointerdown', () => {
  controls.autoRotate = false;
  const button = document.querySelector('#auto-rotate');
  button.classList.remove('active');
  button.setAttribute('aria-pressed', 'false');
});

function resize() {
  const width = innerWidth;
  const height = innerHeight;
  const aspect = width / height;
  const span = aspect < .9 ? 25 : 20;
  camera.left = -span * aspect / 2;
  camera.right = span * aspect / 2;
  camera.top = span / 2;
  camera.bottom = -span / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
}
addEventListener('resize', resize);
resize();

async function start() {
  try {
    await Promise.all([
      loadModel('low', './assets/models/cozy-village-low.glb'),
      loadModel('detail', './assets/models/cozy-village-detail.glb')
    ]);
    setMode('detail', false);
    requestAnimationFrame(() => requestAnimationFrame(() => loading.classList.add('done')));
  } catch (error) {
    console.error(error);
    loading.querySelector('strong').textContent = '마을을 불러오지 못했어요';
    loading.querySelector('.loading-line').hidden = true;
  }
}
start();

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const elapsed = clock.getElapsedTime();
  controls.update();
  if (models.detail) models.detail.rotation.y = Math.sin(elapsed * .13) * .004;
  if (models.low) models.low.rotation.y = Math.sin(elapsed * .13) * .004;
  renderer.render(scene, camera);
}
animate();
