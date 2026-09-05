import * as THREE from 'three';
import {OrbitControls} from './vendor/OrbitControls.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
const $=id=>document.getElementById(id), canvas=$('scene');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.17;
const scene=new THREE.Scene();scene.background=new THREE.Color('#253234');scene.fog=new THREE.Fog('#344341',48,100);
const camera=new THREE.PerspectiveCamera(innerWidth<620?56:38,innerWidth/innerHeight,.1,160);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.07;controls.minDistance=7;controls.maxDistance=58;controls.maxPolarAngle=Math.PI*.485;controls.minPolarAngle=.15;controls.target.set(0,1.8,-.7);
const home=new THREE.Vector3(22,25,28);
function reset(){camera.position.copy(home).multiplyScalar(innerWidth<620?1.12:1);controls.target.set(0,1.8,-.7);controls.update()};reset();
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;scene.environmentIntensity=.36;room.dispose();pmrem.dispose();
scene.add(new THREE.HemisphereLight('#a9c1c4','#34352b',1.65));
const sun=new THREE.DirectionalLight('#ffe0a4',3.6);sun.position.set(-10,19,7);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-18,right:18,top:18,bottom:-18,near:1,far:60});sun.shadow.normalBias=.045;sun.shadow.bias=-.0002;scene.add(sun);
const fill=new THREE.DirectionalLight('#81b6c7',.8);fill.position.set(8,10,-6);scene.add(fill);
let model,panMode=false,shadows=true;
new GLTFLoader().load('./assets/models/afterlight-rain-court.glb',g=>{
 model=g.scene;const remove=[];let meshes=0;
 model.traverse(o=>{if(o.isLight||o.isCamera)remove.push(o);if(o.isMesh){meshes++;o.castShadow=!/Rainwater|Ivy/.test(o.name);o.receiveShadow=true;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){if(m.name.includes('rainwater')){m.roughness=.08;m.envMapIntensity=2}if(m.name.includes('generated'))m.envMapIntensity=.7;m.side=THREE.DoubleSide;}}});remove.forEach(o=>o.removeFromParent());scene.add(model);
 for(const x of [.38,2.55,4.4,6.7]){const l=new THREE.PointLight('#ffb04f',14,5,2);l.position.set(x,2.25,-4.5);scene.add(l)}
 const gate=new THREE.PointLight('#5fcbd7',19,6,2);gate.position.set(-5.6,2.5,-6.7);scene.add(gate);
 $('loading').remove();$('state').textContent='DISTRICT ONLINE';window.afterlight={loaded:true,meshes,renderer,scene,camera,controls};
},e=>{$('progress').textContent=e.total?`${Math.round(e.loaded/e.total*100)}% · loading geometry & textures`:`${(e.loaded/1048576).toFixed(1)} MB received`},e=>{$('progress').textContent='Scene could not load. Serve this folder over HTTP and reload.';$('state').textContent='CONNECTION LOST';console.error(e)});
function mode(pan){panMode=pan;controls.mouseButtons.LEFT=pan?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;controls.touches.ONE=pan?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;$('pan').classList.toggle('selected',pan);$('orbit').classList.toggle('selected',!pan);$('pan').setAttribute('aria-pressed',pan);$('orbit').setAttribute('aria-pressed',!pan);$('hint').textContent=pan?'Drag to pan · Scroll to zoom':'Drag to orbit · Shift + drag to pan · Scroll to zoom'}
$('pan').onclick=()=>mode(true);$('orbit').onclick=()=>mode(false);$('reset').onclick=reset;
$('tour').onclick=()=>{controls.autoRotate=!controls.autoRotate;controls.autoRotateSpeed=.32;$('tour').setAttribute('aria-pressed',controls.autoRotate);$('tour').innerHTML=controls.autoRotate?'Pause orbit <span>Ⅱ</span>':'Slow orbit <span>↻</span>'};
$('quality').onclick=()=>{shadows=!shadows;renderer.shadowMap.enabled=shadows;scene.traverse(o=>{if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.needsUpdate=true}});$('quality').setAttribute('aria-pressed',shadows);$('quality').innerHTML=`◈ <span>Shadows ${shadows?'on':'off'}</span>`};
function drawer(show){$('downloads').hidden=!show;$('assets').setAttribute('aria-expanded',show);if(show)$('close').focus();else $('assets').focus()}
$('assets').onclick=()=>drawer($('downloads').hidden);$('close').onclick=()=>drawer(false);
$('fullscreen').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen()}catch{}};
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('downloads').hidden)drawer(false);if(e.target.closest('button,a,input'))return;if(e.key.toLowerCase()==='r')reset();const dirs={w:[0,-1],ArrowUp:[0,-1],s:[0,1],ArrowDown:[0,1],a:[-1,0],ArrowLeft:[-1,0],d:[1,0],ArrowRight:[1,0]};if(dirs[e.key]){e.preventDefault();const [x,z]=dirs[e.key];const right=new THREE.Vector3().setFromMatrixColumn(camera.matrix,0);const front=new THREE.Vector3().crossVectors(camera.up,right);const delta=right.multiplyScalar(x*.35).add(front.multiplyScalar(-z*.35));camera.position.add(delta);controls.target.add(delta)}});
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.fov=innerWidth<620?56:38;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
renderer.setAnimationLoop(()=>{controls.update();$('heading').style.transformOrigin='111px 85px';$('heading').style.transform=`rotate(${-controls.getAzimuthalAngle()*180/Math.PI}deg)`;renderer.render(scene,camera)});
