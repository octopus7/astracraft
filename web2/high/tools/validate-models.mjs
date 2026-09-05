import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODELS = join(HERE, '..', 'public', 'models');
const stems = ['repair-district', 'mender-drone'];
const audit = JSON.parse(await readFile(join(MODELS, 'model-audit.json'), 'utf8'));
const errors = [];

function readAccessor(gltf, bin, accessorIndex) {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[accessor.type];
  const componentSize = accessor.componentType === 5126 ? 4 : 2;
  const stride = view.byteStride ?? components * componentSize;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];
  for (let row = 0; row < accessor.count; row += 1) {
    for (let component = 0; component < components; component += 1) {
      const offset = start + row * stride + component * componentSize;
      values.push(accessor.componentType === 5126 ? bin.readFloatLE(offset) : bin.readUInt16LE(offset));
    }
  }
  return values;
}

function rectanglesOverlap(a, b) {
  const epsilon = 1e-8;
  return a[0] < b[2] - epsilon && a[2] > b[0] + epsilon && a[1] < b[3] - epsilon && a[3] > b[1] + epsilon;
}

for (const stem of stems) {
  const gltf = JSON.parse(await readFile(join(MODELS, `${stem}.gltf`), 'utf8'));
  if (gltf.asset?.version !== '2.0') errors.push(`${stem}: not glTF 2.0`);
  if (!gltf.buffers?.[0]?.uri?.endsWith('.bin')) errors.push(`${stem}: external .bin missing`);
  const bin = await readFile(join(MODELS, gltf.buffers[0].uri));
  if (bin.length !== gltf.buffers[0].byteLength) errors.push(`${stem}: binary byteLength mismatch`);
  for (const image of gltf.images ?? []) {
    if (!image.uri?.endsWith('.png')) errors.push(`${stem}: non-PNG texture ${image.uri}`);
    else await access(join(MODELS, image.uri));
  }
  for (const material of gltf.materials ?? []) {
    if (!material.pbrMetallicRoughness) errors.push(`${stem}: ${material.name} is not standard metallic-roughness PBR`);
    if (material.occlusionTexture?.index !== material.pbrMetallicRoughness?.metallicRoughnessTexture?.index) errors.push(`${stem}: ${material.name} does not share the packed ORM texture`);
    if (material.extensions) errors.push(`${stem}: ${material.name} has non-portable material extension`);
  }
  for (const primitive of gltf.meshes?.[0]?.primitives ?? []) {
    if (primitive.attributes?.POSITION == null || primitive.attributes?.NORMAL == null || primitive.attributes?.TEXCOORD_0 == null) {
      errors.push(`${stem}: primitive missing POSITION/NORMAL/TEXCOORD_0`);
    }
    const uvs = readAccessor(gltf, bin, primitive.attributes.TEXCOORD_0);
    const indices = readAccessor(gltf, bin, primitive.indices);
    if (uvs.some((value) => value < 0 || value > 1)) errors.push(`${stem}: actual UV buffer contains a value outside 0-1`);
    const islandMap = new Map();
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = [indices[i], indices[i + 1], indices[i + 2]].map((index) => [uvs[index * 2], uvs[index * 2 + 1]]);
      const rect = [
        Math.min(...triangle.map((uv) => uv[0])), Math.min(...triangle.map((uv) => uv[1])),
        Math.max(...triangle.map((uv) => uv[0])), Math.max(...triangle.map((uv) => uv[1]))
      ];
      const key = rect.map((value) => value.toFixed(6)).join(':');
      islandMap.set(key, rect);
    }
    const islands = [...islandMap.values()];
    if (islands.length !== primitive.extras?.uvIslandCount) errors.push(`${stem}: declared UV island count does not match binary data`);
    for (let i = 0; i < islands.length; i += 1) {
      for (let j = i + 1; j < islands.length; j += 1) {
        if (rectanglesOverlap(islands[i], islands[j])) {
          errors.push(`${stem}: overlapping UV islands ${i}/${j} in ${primitive.extras?.materialRole}`);
          break;
        }
      }
    }
  }
}

for (const model of audit.models) {
  if (model.uvRange.some((value) => value < 0 || value > 1)) errors.push(`${model.model}: UV outside 0-1`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  const islandCount = audit.models.flatMap((model) => model.primitives).reduce((sum, primitive) => sum + primitive.islandCount, 0);
  console.log(`Validated ${stems.length} glTF 2.0 assets, ${islandCount} non-overlapping 0-1 UV islands, external BIN + PNG PBR textures.`);
}
