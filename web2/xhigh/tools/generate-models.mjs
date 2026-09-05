import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = dirname(fileURLToPath(import.meta.url));
const outputDir = join(toolDir, '..', 'assets', 'models');
mkdirSync(outputDir, { recursive: true });

const gltf = {
  asset: {
    version: '2.0',
    generator: 'AstraCraft xhigh procedural modeler 1.0',
    copyright: 'Original AstraCraft project asset',
    extras: {
      coordinateSystem: 'Y-up, right-handed, metres',
      uvPolicy: 'All six box-face islands are non-overlapping and contained within one atlas quadrant in the 0-1 range.',
    },
  },
  scene: 0,
  scenes: [{ name: 'Cinder Yard Repair District', nodes: [] }],
  nodes: [],
  meshes: [],
  accessors: [],
  bufferViews: [],
  buffers: [{ uri: 'repair-district.bin', byteLength: 0 }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
  images: [
    { name: 'Material Atlas Base Color', uri: '../textures/material-atlas-basecolor.png' },
    { name: 'Material Atlas Normal', uri: '../textures/material-atlas-normal.png' },
    { name: 'Material Atlas ORM', uri: '../textures/material-atlas-orm.png' },
  ],
  textures: [
    { name: 'Atlas Base Color', sampler: 0, source: 0 },
    { name: 'Atlas Normal', sampler: 0, source: 1 },
    { name: 'Atlas ORM', sampler: 0, source: 2 },
  ],
  materials: [
    {
      name: 'RepairDistrictAtlasPBR',
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        baseColorTexture: { index: 0, texCoord: 0 },
        metallicFactor: 1,
        roughnessFactor: 1,
        metallicRoughnessTexture: { index: 2, texCoord: 0 },
      },
      normalTexture: { index: 1, texCoord: 0, scale: 0.55 },
      occlusionTexture: { index: 2, texCoord: 0, strength: 0.7 },
    },
    {
      name: 'WarmServiceGlow',
      pbrMetallicRoughness: { baseColorFactor: [0.92, 0.24, 0.055, 1], metallicFactor: 0.15, roughnessFactor: 0.35 },
      emissiveFactor: [0.92, 0.24, 0.055],
    },
    {
      name: 'CyanSignalGlow',
      pbrMetallicRoughness: { baseColorFactor: [0.06, 0.74, 0.72, 1], metallicFactor: 0.12, roughnessFactor: 0.3 },
      emissiveFactor: [0.06, 0.74, 0.72],
    },
  ],
};

const chunks = [];
let byteOffset = 0;

function appendTypedArray(array, target) {
  const padding = (4 - (byteOffset % 4)) % 4;
  if (padding) {
    chunks.push(Buffer.alloc(padding));
    byteOffset += padding;
  }
  const buffer = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const bufferView = gltf.bufferViews.length;
  gltf.bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
  chunks.push(buffer);
  byteOffset += buffer.length;
  return bufferView;
}

function addAccessor(array, type, componentType, target, min, max) {
  const bufferView = appendTypedArray(array, target);
  const accessor = gltf.accessors.length;
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type];
  gltf.accessors.push({ bufferView, componentType, count: array.length / components, type, min, max });
  return accessor;
}

const faces = [
  { normal: [1, 0, 0], vertices: [[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
  { normal: [-1, 0, 0], vertices: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5]] },
  { normal: [0, 1, 0], vertices: [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]] },
  { normal: [0, -1, 0], vertices: [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { normal: [0, 0, 1], vertices: [[0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]] },
  { normal: [0, 0, -1], vertices: [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]] },
];

function createBoxAccessors(region) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const columns = 3;
  const rows = 2;
  const gap = 0.012;
  const cellWidth = region.width / columns;
  const cellHeight = region.height / rows;

  faces.forEach((face, faceIndex) => {
    const column = faceIndex % columns;
    const row = Math.floor(faceIndex / columns);
    const u0 = region.u + column * cellWidth + gap;
    const v0 = region.v + row * cellHeight + gap;
    const u1 = region.u + (column + 1) * cellWidth - gap;
    const v1 = region.v + (row + 1) * cellHeight - gap;
    const faceUvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    face.vertices.forEach((vertex, vertexIndex) => {
      positions.push(...vertex);
      normals.push(...face.normal);
      uvs.push(...faceUvs[vertexIndex]);
    });
    const start = faceIndex * 4;
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  });

  return {
    POSITION: addAccessor(new Float32Array(positions), 'VEC3', 5126, 34962, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]),
    NORMAL: addAccessor(new Float32Array(normals), 'VEC3', 5126, 34962, [-1, -1, -1], [1, 1, 1]),
    TEXCOORD_0: addAccessor(new Float32Array(uvs), 'VEC2', 5126, 34962, [region.u, region.v], [region.u + region.width, region.v + region.height]),
    indices: addAccessor(new Uint16Array(indices), 'SCALAR', 5123, 34963, [0], [23]),
  };
}

const atlasRegions = {
  charcoal: { u: 0, v: 0.5, width: 0.5, height: 0.5 },
  rust: { u: 0.5, v: 0.5, width: 0.5, height: 0.5 },
  stone: { u: 0, v: 0, width: 0.5, height: 0.5 },
  teal: { u: 0.5, v: 0, width: 0.5, height: 0.5 },
};

const regionAccessors = Object.fromEntries(Object.entries(atlasRegions).map(([name, region]) => [name, createBoxAccessors(region)]));
const meshIndices = {};

function addMesh(name, regionName, material = 0) {
  const accessors = regionAccessors[regionName];
  const meshIndex = gltf.meshes.length;
  gltf.meshes.push({
    name,
    primitives: [{
      attributes: { POSITION: accessors.POSITION, NORMAL: accessors.NORMAL, TEXCOORD_0: accessors.TEXCOORD_0 },
      indices: accessors.indices,
      material,
      mode: 4,
    }],
    extras: { uvIslandCount: 6, uvRegion: regionName, nonOverlappingUv: true },
  });
  meshIndices[name] = meshIndex;
}

addMesh('CharcoalPanelBox', 'charcoal');
addMesh('RustPanelBox', 'rust');
addMesh('StoneSlabBox', 'stone');
addMesh('TealMachineBox', 'teal');
addMesh('WarmGlowBox', 'rust', 1);
addMesh('CyanGlowBox', 'teal', 2);

function quaternionY(radians) {
  return [0, Math.sin(radians / 2), 0, Math.cos(radians / 2)];
}

function addGroup(name, translation = [0, 0, 0], parent = gltf.scenes[0].nodes) {
  const index = gltf.nodes.length;
  gltf.nodes.push({ name, translation, children: [] });
  parent.push(index);
  return gltf.nodes[index].children;
}

function addBox(name, mesh, translation, scale, parent = gltf.scenes[0].nodes, rotationY = 0) {
  const node = { name, mesh: meshIndices[mesh], translation, scale };
  if (rotationY) node.rotation = quaternionY(rotationY);
  const index = gltf.nodes.length;
  gltf.nodes.push(node);
  parent.push(index);
  return index;
}

for (let ix = -3; ix <= 3; ix += 1) {
  for (let iz = -2; iz <= 2; iz += 1) {
    const raised = ((ix * 7 + iz * 11) % 5 === 0) ? 0.04 : 0;
    addBox(`Ground_${ix + 3}_${iz + 2}`, 'StoneSlabBox', [ix * 5.05, 0.05 + raised, iz * 5.05], [4.88, 0.18, 4.88]);
  }
}

addBox('NorthMegawall', 'CharcoalPanelBox', [0, 5.4, -15], [36.5, 10.7, 1.6]);
addBox('WestMegawall', 'CharcoalPanelBox', [-18.2, 4.5, 0], [1.7, 9, 29]);
addBox('EastMegawall', 'CharcoalPanelBox', [18.2, 4.8, 0], [1.7, 9.6, 29]);
addBox('SouthWallWest', 'CharcoalPanelBox', [-11.8, 3.1, 14.2], [12.5, 6.2, 1.5]);
addBox('SouthWallEast', 'CharcoalPanelBox', [11.8, 3.1, 14.2], [12.5, 6.2, 1.5]);

for (const x of [-16, -11, -6, -1, 4, 9, 14]) {
  addBox(`NorthButtress_${x}`, 'StoneSlabBox', [x, 5.2, -13.85], [1.15, 10.4, 1.4]);
  addBox(`NorthCap_${x}`, 'StoneSlabBox', [x, 10.9, -14.4], [3.6, 0.62, 2.2]);
}
for (const z of [-11.5, -7, -2.5, 2, 6.5, 11]) {
  addBox(`WestButtress_${z}`, 'StoneSlabBox', [-17.1, 4, z], [1.7, 8, 1.15]);
  addBox(`EastButtress_${z}`, 'StoneSlabBox', [17.1, 4.4, z], [1.7, 8.8, 1.15]);
}

for (const [name, x, z, height] of [
  ['NW', -16.2, -13.1, 13], ['NE', 16.1, -13.2, 14.5], ['SW', -16, 12.5, 10], ['SE', 16, 12.5, 11.5],
]) {
  addBox(`Tower_${name}_Core`, 'CharcoalPanelBox', [x, height / 2, z], [4.2, height, 4.2]);
  addBox(`Tower_${name}_Crown`, 'StoneSlabBox', [x, height + 0.35, z], [5, 0.7, 5]);
  addBox(`Tower_${name}_Signal`, 'CyanGlowBox', [x, height + 0.85, z - 1.8], [1.6, 0.16, 0.16]);
}

const bay = addGroup('RepairBay', [4.8, 0, -10.9]);
addBox('RepairBay_Block', 'RustPanelBox', [0, 2.65, 0], [12.4, 5.3, 5], bay);
addBox('RepairBay_Roof', 'CharcoalPanelBox', [0, 5.55, 0], [13.4, 0.52, 5.8], bay);
addBox('RepairBay_Door', 'TealMachineBox', [0, 1.9, 2.54], [4.7, 3.8, 0.24], bay);
for (const x of [-4.8, -3.2, 3.2, 4.8]) addBox(`RepairBay_Lamp_${x}`, 'WarmGlowBox', [x, 2.1, 2.7], [0.22, 1.25, 0.16], bay);
for (const x of [-3.5, 0, 3.5]) addBox(`RepairBay_RoofUnit_${x}`, 'CharcoalPanelBox', [x, 6.1, 0], [2.3, 0.7, 1.8], bay);

const annex = addGroup('SignalAnnex', [-11.7, 0, -7.6]);
addBox('Annex_Core', 'TealMachineBox', [0, 2.1, 0], [5.5, 4.2, 4.4], annex);
addBox('Annex_Roof', 'StoneSlabBox', [0, 4.45, 0], [6.3, 0.5, 5.1], annex);
addBox('Annex_Door', 'CharcoalPanelBox', [1.15, 1.55, 2.24], [1.8, 3.1, 0.22], annex);
addBox('Annex_Glow', 'CyanGlowBox', [-1.2, 2.6, 2.38], [0.18, 1.6, 0.12], annex);

const gantry = addGroup('PipeGantry', [-7.8, 0, 1.8]);
addBox('Gantry_WestPost', 'CharcoalPanelBox', [-2.7, 2.8, 0], [0.65, 5.6, 0.65], gantry);
addBox('Gantry_EastPost', 'CharcoalPanelBox', [2.7, 2.8, 0], [0.65, 5.6, 0.65], gantry);
addBox('Gantry_Beam', 'TealMachineBox', [0, 5.35, 0], [6, 0.65, 0.8], gantry);
addBox('Gantry_PipeA', 'RustPanelBox', [0, 5.78, 0.32], [6.1, 0.18, 0.18], gantry);
addBox('Gantry_PipeB', 'RustPanelBox', [0, 5.78, -0.32], [6.1, 0.18, 0.18], gantry);

for (const [index, x, z, rotation] of [
  [0, -12.6, 6.8, 0.2], [1, -10.7, 8.6, -0.12], [2, 11.3, 7.5, 0.08], [3, 13.2, 5.5, -0.2], [4, 11.7, -6.7, 0.14],
]) {
  addBox(`Cargo_${index}_Base`, index % 2 ? 'TealMachineBox' : 'RustPanelBox', [x, 0.75, z], [1.8, 1.5, 1.8], gltf.scenes[0].nodes, rotation);
  addBox(`Cargo_${index}_Latch`, 'WarmGlowBox', [x, 1.45, z - 0.92], [0.62, 0.12, 0.1], gltf.scenes[0].nodes, rotation);
}

function addStation(id, x, z, rotation = 0) {
  const children = addGroup(`Station_${id}`, [x, 0, z]);
  addBox(`${id}_Base`, 'CharcoalPanelBox', [0, 0.34, 0], [1.7, 0.68, 1.7], children, rotation);
  addBox(`${id}_Mast`, 'TealMachineBox', [0, 1.25, 0], [0.55, 1.8, 0.55], children, rotation);
  addBox(`${id}_Head`, 'RustPanelBox', [0, 2.25, 0], [1.25, 0.5, 0.85], children, rotation);
  addBox(`${id}_Core`, 'WarmGlowBox', [0, 2.27, 0.46], [0.46, 0.22, 0.08], children, rotation);
  addBox(`${id}_ArmL`, 'CharcoalPanelBox', [-0.72, 1.55, 0], [0.9, 0.16, 0.18], children, rotation);
  addBox(`${id}_ArmR`, 'CharcoalPanelBox', [0.72, 1.55, 0], [0.9, 0.16, 0.18], children, rotation);
}

addStation('Aster', -9.25, -6.6, 0.12);
addStation('Meridian', 8.7, -2.1, -0.2);
addStation('Lumen', 5.2, 8.3, 0.08);

const courier = addGroup('CourierRig', [0, 0.8, 6.1]);
addBox('Courier_Chassis', 'TealMachineBox', [0, 0.62, 0], [1.25, 0.55, 1.5], courier);
addBox('Courier_Cabin', 'CharcoalPanelBox', [0, 1.08, -0.08], [0.85, 0.62, 0.9], courier);
addBox('Courier_Lamp', 'WarmGlowBox', [0, 1.1, -0.56], [0.42, 0.18, 0.08], courier);
addBox('Courier_SkidL', 'CharcoalPanelBox', [-0.66, 0.3, 0], [0.24, 0.26, 1.5], courier);
addBox('Courier_SkidR', 'CharcoalPanelBox', [0.66, 0.3, 0], [0.24, 0.26, 1.5], courier);
addBox('Courier_Antenna', 'CyanGlowBox', [0.25, 1.65, 0.14], [0.08, 0.7, 0.08], courier);

gltf.buffers[0].byteLength = byteOffset;
const binary = Buffer.concat(chunks);
writeFileSync(join(outputDir, 'repair-district.bin'), binary);
writeFileSync(join(outputDir, 'repair-district.gltf'), `${JSON.stringify(gltf, null, 2)}\n`);
console.log(`Generated repair-district.gltf with ${gltf.nodes.length} nodes, ${gltf.meshes.length} meshes, and ${binary.length} binary bytes.`);
