import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const mount=document.querySelector('#game');
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x172123); scene.fog=new THREE.FogExp2(0x172123,.018);
const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,180); camera.position.set(25,21,27);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'}); renderer.setPixelRatio(Math.min(devicePixelRatio,2)); renderer.setSize(innerWidth,innerHeight); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=.85; mount.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement); controls.target.set(0,1,0); controls.enableDamping=true; controls.dampingFactor=.06; controls.minDistance=13; controls.maxDistance=52; controls.maxPolarAngle=Math.PI*.46; controls.enablePan=true;
scene.add(new THREE.HemisphereLight(0x9ebbc0,0x17201d,1.25)); const sun=new THREE.DirectionalLight(0xffe7bd,3.2); sun.position.set(-12,24,9); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-28;sun.shadow.camera.right=28;sun.shadow.camera.top=28;sun.shadow.camera.bottom=-28; scene.add(sun);
const warm=new THREE.PointLight(0xff8e4d,42,13,2); warm.position.set(3,4,-10); scene.add(warm); const cyan=new THREE.PointLight(0x66d9df,28,10,2);cyan.position.set(-9,3,-4);scene.add(cyan);

const tex=new THREE.TextureLoader().load('./assets/textures/material-atlas.png'); tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=renderer.capabilities.getMaxAnisotropy();
const groundTex=tex.clone(); groundTex.needsUpdate=true; groundTex.repeat.set(.5,.5); groundTex.offset.set(0,0);
const ground=new THREE.Mesh(new THREE.PlaneGeometry(38,30,19,15),new THREE.MeshStandardMaterial({map:groundTex,color:0x99a09b,roughness:.38,metalness:.16}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
const border=new THREE.Mesh(new THREE.BoxGeometry(40,.7,32),new THREE.MeshStandardMaterial({color:0x151c1c,roughness:.9}));border.position.y=-.42;scene.add(border);
for(let i=0;i<24;i++){const puddle=new THREE.Mesh(new THREE.CircleGeometry(THREE.MathUtils.randFloat(.4,2.2),24),new THREE.MeshPhysicalMaterial({color:0x8aa9ad,metalness:.3,roughness:.12,transparent:true,opacity:.28}));puddle.rotation.x=-Math.PI/2;puddle.scale.y=THREE.MathUtils.randFloat(.2,.65);puddle.position.set(THREE.MathUtils.randFloatSpread(30),.012,THREE.MathUtils.randFloatSpread(23));scene.add(puddle)}

const loader=new GLTFLoader(); const load=name=>loader.loadAsync(`./assets/models/${name}.gltf`).then(g=>{g.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});return g.scene});
const [wall,building,crate,terminal,lamp,drone]=await Promise.all(['wall-module','district-building','cargo-crate','relay-terminal','lamp-post','service-drone'].map(load));
function put(asset,x,z,rot=0,scale=1){const object=asset.clone();object.position.set(x,0,z);object.rotation.y=rot;object.scale.setScalar(scale);scene.add(object);return object}
put(building,1,-12,0,1.35);put(building,-12,-9,.03,.8);put(building,14,-7,-Math.PI/2,.72);
for(let x=-16;x<=16;x+=4) put(wall,x,15,Math.PI,1.05); for(let z=-10;z<=10;z+=4) put(wall,-19,z,Math.PI/2,1.05); for(let z=-10;z<=10;z+=4) put(wall,19,z,-Math.PI/2,1.05);
[[-11,8],[-8,8],[-13,5],[12,8],[14,7],[8,-2],[10,-1]].forEach(([x,z],i)=>put(crate,x,z,i*.45,i%3===0?1.25:1));
[[-14,11],[14,11],[-15,-7],[15,-8],[-5,-9],[8,-9]].forEach(([x,z])=>{put(lamp,x,z);const l=new THREE.PointLight(0xffb66b,9,6,2);l.position.set(x,3.3,z+.2);scene.add(l)});
const player=put(drone,0,3,0,1); const playerGlow=new THREE.PointLight(0x71e7ee,8,4,2);playerGlow.position.set(0,1,0);player.add(playerGlow);

const relayPoints=[new THREE.Vector3(-10,0,-2),new THREE.Vector3(10,0,7),new THREE.Vector3(8,0,-7)];let restored=0;
const relays=relayPoints.map((point,i)=>{const root=put(terminal,point.x,point.z,i*.8,1);const ring=new THREE.Mesh(new THREE.TorusGeometry(.75,.035,8,48),new THREE.MeshBasicMaterial({color:0xe0c36f,transparent:true,opacity:.85}));ring.rotation.x=Math.PI/2;ring.position.y=.08;root.add(ring);root.userData={active:true,ring,index:i};return root});

const rainCount=1900,rainPos=new Float32Array(rainCount*3);for(let i=0;i<rainCount;i++){rainPos[i*3]=THREE.MathUtils.randFloatSpread(55);rainPos[i*3+1]=THREE.MathUtils.randFloat(2,25);rainPos[i*3+2]=THREE.MathUtils.randFloatSpread(48)}const rainGeo=new THREE.BufferGeometry();rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPos,3));const rain=new THREE.Points(rainGeo,new THREE.PointsMaterial({color:0xb9d5d6,size:.035,transparent:true,opacity:.55}));scene.add(rain);

const keys=new Set(),target=new THREE.Vector3(0,0,3),ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let movingByClick=false,last=performance.now();
addEventListener('keydown',e=>keys.add(e.key.toLowerCase()));addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0||e.shiftKey)return;pointer.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObject(ground)[0];if(hit){target.copy(hit.point);movingByClick=true}});
function updatePlayer(dt){const v=new THREE.Vector3((keys.has('d')?1:0)-(keys.has('a')?1:0),0,(keys.has('s')?1:0)-(keys.has('w')?1:0));if(v.lengthSq()){v.normalize();movingByClick=false}else if(movingByClick){v.copy(target).sub(player.position);v.y=0;if(v.length()<.18){v.set(0,0,0);movingByClick=false}else v.normalize()}player.position.addScaledVector(v,dt*4.2);player.position.x=THREE.MathUtils.clamp(player.position.x,-16.5,16.5);player.position.z=THREE.MathUtils.clamp(player.position.z,-10.5,12.5);if(v.lengthSq())player.rotation.y=Math.atan2(v.x,v.z);player.position.y=.08+Math.sin(performance.now()*.004)*.07;document.querySelector('#mapDot').style.transform=`translate(calc(-50% + ${player.position.x*1.8}px),calc(-50% + ${player.position.z*1.5}px))`;for(const relay of relays)if(relay.userData.active&&relay.position.distanceTo(player.position)<2.2){relay.userData.active=false;restored++;relay.userData.ring.material.color.set(0x69e0d7);relay.userData.ring.scale.setScalar(1.35);document.querySelector('#progressBar').style.width=`${restored/3*100}%`;document.querySelector('#missionProgress').textContent=`${restored} / 3 signals restored`;toast(restored===3?'DISTRICT LINK RESTORED':'LOCAL RELAY ONLINE');if(restored===3)document.querySelector('#missionTitle').textContent='RAIN COURT STABILIZED'}}
function animate(now){const dt=Math.min((now-last)/1000,.05);last=now;updatePlayer(dt);const p=rain.geometry.attributes.position.array;for(let i=1;i<p.length;i+=3){p[i]-=dt*15;if(p[i]<0)p[i]=25}rain.geometry.attributes.position.needsUpdate=true;relays.forEach((r,i)=>{r.userData.ring.rotation.z=now*.0008+i;r.userData.ring.material.opacity=.55+Math.sin(now*.004+i)*.25});controls.update();renderer.render(scene,camera);requestAnimationFrame(animate)}requestAnimationFrame(animate);

function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),1800)}
let audio=null;document.querySelector('#soundButton').addEventListener('click',async e=>{if(!audio){audio=new AudioContext();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=64;gain.gain.value=.018;osc.connect(gain).connect(audio.destination);osc.start()}if(audio.state==='running'){await audio.suspend();e.currentTarget.textContent='◖ Sound off'}else{await audio.resume();e.currentTarget.textContent='◖ Sound on'}});
document.querySelector('#helpButton').addEventListener('click',()=>document.querySelector('.controls').classList.toggle('hidden'));
document.querySelector('#cameraMode').addEventListener('click',()=>{controls.reset();camera.position.set(25,21,27);controls.target.copy(player.position);toast('CAMERA RECENTERED')});
setInterval(()=>{const d=new Date();document.querySelector('#clock').textContent=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`},1000);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
document.querySelector('#loading').classList.add('done');
