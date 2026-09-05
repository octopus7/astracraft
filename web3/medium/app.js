import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
const mount=document.querySelector('#viewport');
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
mount.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#555d58');scene.fog=new THREE.FogExp2('#6b736c',.012);
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;scene.environmentIntensity=.35;room.dispose();pmrem.dispose();
const viewFov=()=>innerWidth<700?85:40;
const camera=new THREE.PerspectiveCamera(viewFov(),innerWidth/innerHeight,.1,140);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.maxPolarAngle=Math.PI*.47;controls.minDistance=9;controls.maxDistance=50;controls.target.set(0,1.1,0);
function reset(){camera.position.set(16,19,23);controls.target.set(0,1.2,0);controls.update()}reset();
scene.add(new THREE.HemisphereLight('#c7dce1','#494535',2));
const sun=new THREE.DirectionalLight('#ffdb9c',3.5);sun.position.set(-10,19,9);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-15,right:15,top:15,bottom:-15,near:.5,far:60});sun.shadow.normalBias=.04;scene.add(sun);
const fill=new THREE.DirectionalLight('#97bdca',.7);fill.position.set(8,10,-4);scene.add(fill);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#414a43',roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.85;ground.receiveShadow=true;scene.add(ground);
for(const x of [1,3,6.2]){const l=new THREE.PointLight('#ffb654',12,5,2);l.position.set(x,1.8,-3.5);scene.add(l)}
const original=new Map();let model;let checkerOn=false;
const pixels=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){let i=(y*64+x)*4,c=((x>>2)+(y>>2))%2;pixels[i]=c?218:28;pixels[i+1]=c?197:47;pixels[i+2]=c?128:48;pixels[i+3]=255}
const checker=new THREE.DataTexture(pixels,64,64);checker.wrapS=checker.wrapT=THREE.RepeatWrapping;checker.repeat.set(6,6);checker.magFilter=THREE.NearestFilter;checker.needsUpdate=true;checker.colorSpace=THREE.SRGBColorSpace;
const checkerMaterial=new THREE.MeshStandardMaterial({map:checker,roughness:.8});
new GLTFLoader().load('./assets/rain-court.glb',g=>{model=g.scene;scene.add(model);model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;original.set(o,o.material);if(o.material.map)o.material.map.anisotropy=renderer.capabilities.getMaxAnisotropy()}});document.querySelector('#loading').remove();window.sceneReady=true},p=>{if(p.total)document.querySelector('#loadtext').textContent=`안뜰을 불러오는 중 ${Math.round(p.loaded/p.total*100)}%`},e=>{document.querySelector('#loadtext').textContent='모델을 불러오지 못했습니다. 새로고침하거나 파일 경로를 확인하세요.';console.error(e)});
document.querySelector('#reset').onclick=reset;
for(const mode of ['orbit','pan'])document.querySelector('#'+mode).onclick=()=>{controls.mouseButtons.LEFT=mode==='orbit'?THREE.MOUSE.ROTATE:THREE.MOUSE.PAN;for(const m of ['orbit','pan'])document.querySelector('#'+m).classList.toggle('active',m===mode)};
document.querySelector('#inspect').onclick=e=>{if(!model)return;checkerOn=!checkerOn;original.forEach((mat,o)=>o.material=checkerOn?checkerMaterial:mat);e.currentTarget.textContent=checkerOn?'재질 보기':'UV 검사';e.currentTarget.setAttribute('aria-pressed',String(checkerOn))};
for(const [button,dialog] of [['assets','downloads'],['help','guide']]){const d=document.querySelector('#'+dialog);document.querySelector('#'+button).onclick=()=>d.showModal();d.querySelector('.close').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target===d&&e.offsetX<0)d.close()})}
addEventListener('keydown',e=>{if(e.key.toLowerCase()==='r'&&!document.querySelector('dialog[open]'))reset()});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.fov=viewFov();camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera)});
