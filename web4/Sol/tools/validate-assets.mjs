import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseGlb(buffer) {
  if (buffer.toString('utf8', 0, 4) !== 'glTF') throw new Error('Invalid GLB magic');
  if (buffer.readUInt32LE(4) !== 2) throw new Error('Expected glTF 2.0');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.toString('utf8', 16, 20);
  if (jsonType !== 'JSON') throw new Error('Missing GLB JSON chunk');
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
}

const root = resolve(import.meta.dirname, '..');
const required = ['Cottage_Walls', 'Bridge_Plank_00', 'Well_Water', 'PuddleReflection', 'Stream_Water', 'Island_Grass'];
for (const variant of ['low', 'detail']) {
  const path = resolve(root, 'assets', 'models', `cozy-village-${variant}.glb`);
  const data = await readFile(path);
  const json = parseGlb(data);
  const names = (json.nodes || []).map(node => node.name || '');
  const missing = required.filter(name => !names.some(candidate => candidate.startsWith(name)));
  if (missing.length) throw new Error(`${variant}: missing ${missing.join(', ')}`);
  if (!(json.meshes?.length > 50)) throw new Error(`${variant}: unexpectedly small mesh set`);
  console.log(`${variant}: ${(await stat(path)).size} bytes, ${json.nodes.length} nodes, ${json.meshes.length} meshes, ${json.materials?.length || 0} materials`);
}

const blend = await stat(resolve(root, 'assets', 'models', 'cozy-village-source.blend'));
if (blend.size < 1_000_000) throw new Error('Blender source appears incomplete');
console.log(`blend: ${blend.size} bytes`);

for (const file of [
  'vendor/three/build/three.module.min.js',
  'vendor/three/build/three.core.min.js',
  'vendor/three/addons/controls/OrbitControls.js',
  'vendor/three/addons/loaders/GLTFLoader.js',
  'vendor/three/addons/objects/Reflector.js',
  'vendor/three/addons/utils/BufferGeometryUtils.js'
]) await access(resolve(root, '..', file));

const html = await readFile(resolve(root, 'index.html'), 'utf8');
if (/https?:\/\//.test(html)) throw new Error('The page must remain offline/self-contained');
if (!html.includes('data-mode="low"') || !html.includes('data-mode="detail"')) throw new Error('Mode controls are missing');
console.log('viewer: local runtime and both scene controls present');
