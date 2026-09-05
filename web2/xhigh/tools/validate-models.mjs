import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = dirname(fileURLToPath(import.meta.url));
const modelPath = join(toolDir, '..', 'assets', 'models', 'repair-district.gltf');
const modelDir = dirname(modelPath);
const model = JSON.parse(readFileSync(modelPath, 'utf8'));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

check(model.asset?.version === '2.0', 'Asset must declare glTF 2.0.');
check(model.buffers?.length === 1 && model.buffers[0].uri.endsWith('.bin'), 'Model must use one external .bin buffer.');
check(model.images?.length === 3 && model.images.every((image) => image.uri.endsWith('.png')), 'All three PBR textures must be external PNG files.');
check(model.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture, 'Atlas material is missing a base-color texture.');
check(model.materials?.[0]?.pbrMetallicRoughness?.metallicRoughnessTexture, 'Atlas material is missing a metallic-roughness texture.');
check(model.materials?.[0]?.normalTexture, 'Atlas material is missing a normal texture.');
check(model.materials?.[0]?.occlusionTexture, 'Atlas material is missing an occlusion texture.');
check(model.nodes?.length >= 100, 'Scene should contain at least 100 authored modular nodes.');

const binaryPath = resolve(modelDir, model.buffers[0].uri);
const binary = readFileSync(binaryPath);
check(binary.length === model.buffers[0].byteLength, 'External buffer byteLength does not match its file.');

for (const image of model.images) {
  const path = resolve(modelDir, image.uri);
  const png = readFileSync(path);
  check(statSync(path).size > 64, `${image.uri} is unexpectedly small.`);
  check(png.toString('hex', 0, 8) === '89504e470d0a1a0a', `${image.uri} is not a valid PNG.`);
  check(png.readUInt32BE(16) >= 512 && png.readUInt32BE(20) >= 512, `${image.uri} is below 512px.`);
}

function readAccessor(accessorIndex) {
  const accessor = model.accessors[accessorIndex];
  const view = model.bufferViews[accessor.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[accessor.type];
  const bytes = { 5123: 2, 5126: 4 }[accessor.componentType];
  const start = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const values = [];
  for (let index = 0; index < accessor.count * components; index += 1) {
    const offset = start + index * bytes;
    values.push(accessor.componentType === 5126 ? binary.readFloatLE(offset) : binary.readUInt16LE(offset));
  }
  return values;
}

function boxesOverlap(a, b, epsilon = 1e-5) {
  return Math.max(a.minU, b.minU) < Math.min(a.maxU, b.maxU) - epsilon
    && Math.max(a.minV, b.minV) < Math.min(a.maxV, b.maxV) - epsilon;
}

let checkedUvSets = 0;
for (const mesh of model.meshes) {
  for (const primitive of mesh.primitives) {
    const uvAccessor = model.accessors[primitive.attributes.TEXCOORD_0];
    check(Boolean(uvAccessor), `${mesh.name} is missing TEXCOORD_0.`);
    if (!uvAccessor) continue;
    const values = readAccessor(primitive.attributes.TEXCOORD_0);
    check(values.every((value) => value >= -1e-6 && value <= 1 + 1e-6), `${mesh.name} has UV coordinates outside 0-1.`);
    check(values.length === 48, `${mesh.name} must expose 24 independent UV vertices.`);
    const islands = [];
    for (let face = 0; face < 6; face += 1) {
      const faceValues = values.slice(face * 8, face * 8 + 8);
      const u = faceValues.filter((_, index) => index % 2 === 0);
      const v = faceValues.filter((_, index) => index % 2 === 1);
      islands.push({ minU: Math.min(...u), maxU: Math.max(...u), minV: Math.min(...v), maxV: Math.max(...v) });
    }
    for (let a = 0; a < islands.length; a += 1) {
      for (let b = a + 1; b < islands.length; b += 1) check(!boxesOverlap(islands[a], islands[b]), `${mesh.name} UV islands ${a} and ${b} overlap.`);
    }
    checkedUvSets += 1;
  }
}

check(checkedUvSets === model.meshes.length, 'Every mesh primitive must have one validated UV set.');

if (failures.length) {
  console.error('Model validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Validated glTF 2.0 scene: ${model.nodes.length} nodes, ${model.meshes.length} non-overlapping UV sets, 3 external PNG PBR maps.`);
