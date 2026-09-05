import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SOURCE = join(ROOT, 'assets-source', 'repair-material-source.png');
const OUT = join(ROOT, 'public', 'models');

const MATERIALS = {
  teal: { range: [0.01, 0.51, 0.49, 0.99], index: 0 },
  ivory: { range: [0.51, 0.51, 0.99, 0.99], index: 1 },
  graphite: { range: [0.01, 0.01, 0.49, 0.49], index: 2 },
  copper: { range: [0.51, 0.01, 0.99, 0.49], index: 3 },
  signal: { range: [0.02, 0.52, 0.48, 0.98], index: 4 }
};

class Part {
  constructor(material) {
    this.material = material;
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = [];
    this.islands = [];
    this.cursor = 0;
  }

  nextUv() {
    const [u0, v0, u1, v1] = MATERIALS[this.material].range;
    const columns = 32;
    const rows = 32;
    if (this.cursor >= columns * rows) throw new Error(`UV atlas capacity exceeded for ${this.material}`);
    const column = this.cursor % columns;
    const row = Math.floor(this.cursor / columns);
    this.cursor += 1;
    const cellW = (u1 - u0) / columns;
    const cellH = (v1 - v0) / rows;
    const padU = cellW * 0.08;
    const padV = cellH * 0.08;
    const rect = [
      u0 + column * cellW + padU,
      v0 + row * cellH + padV,
      u0 + (column + 1) * cellW - padU,
      v0 + (row + 1) * cellH - padV
    ];
    this.islands.push(rect);
    return rect;
  }

  quad(points, normal) {
    const base = this.positions.length / 3;
    const [u0, v0, u1, v1] = this.nextUv();
    for (const point of points) this.positions.push(...point);
    for (let i = 0; i < 4; i += 1) this.normals.push(...normal);
    this.uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  tri(points, normal) {
    const base = this.positions.length / 3;
    const [u0, v0, u1, v1] = this.nextUv();
    for (const point of points) this.positions.push(...point);
    for (let i = 0; i < 3; i += 1) this.normals.push(...normal);
    this.uvs.push((u0 + u1) / 2, v1, u0, v0, u1, v0);
    this.indices.push(base, base + 1, base + 2);
  }
}

class Model {
  constructor(name) {
    this.name = name;
    this.parts = new Map();
  }
  part(material) {
    if (!this.parts.has(material)) this.parts.set(material, new Part(material));
    return this.parts.get(material);
  }
}

function box(model, material, x, y, z, sx, sy, sz) {
  const p = model.part(material);
  const x0 = x - sx / 2, x1 = x + sx / 2;
  const y0 = y - sy / 2, y1 = y + sy / 2;
  const z0 = z - sz / 2, z1 = z + sz / 2;
  p.quad([[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]], [0,0,1]);
  p.quad([[x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0]], [0,0,-1]);
  p.quad([[x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1]], [1,0,0]);
  p.quad([[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0]], [-1,0,0]);
  p.quad([[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[x0,y1,z0]], [0,1,0]);
  p.quad([[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]], [0,-1,0]);
}

function cylinder(model, material, x, y, z, radius, height, segments = 10, axis = 'y') {
  const p = model.part(material);
  const h = height / 2;
  const transform = (a, b, c) => {
    if (axis === 'x') return [x + b, y + a, z + c];
    if (axis === 'z') return [x + a, y + c, z + b];
    return [x + a, y + b, z + c];
  };
  const transformNormal = (a, b, c) => {
    if (axis === 'x') return [b, a, c];
    if (axis === 'z') return [a, c, b];
    return [a, b, c];
  };
  for (let i = 0; i < segments; i += 1) {
    const a0 = i / segments * Math.PI * 2;
    const a1 = (i + 1) / segments * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const normal = transformNormal(Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2));
    p.quad([
      transform(c0 * radius, -h, s0 * radius), transform(c1 * radius, -h, s1 * radius),
      transform(c1 * radius, h, s1 * radius), transform(c0 * radius, h, s0 * radius)
    ], normal);
    p.tri([transform(0, h, 0), transform(c0 * radius, h, s0 * radius), transform(c1 * radius, h, s1 * radius)], transformNormal(0, 1, 0));
    p.tri([transform(0, -h, 0), transform(c1 * radius, -h, s1 * radius), transform(c0 * radius, -h, s0 * radius)], transformNormal(0, -1, 0));
  }
}

function buildDistrict() {
  const model = new Model('Repair District');
  box(model, 'graphite', 0, -0.18, 0, 28, 0.35, 28);

  const lanes = [
    [-8, 0.15, 0, 4.4, 0.3, 24], [1, 0.15, 3, 4.5, 0.3, 20], [8, 0.15, -2, 4.2, 0.3, 21],
    [0, 0.18, -7.5, 24, 0.35, 3.6], [0, 0.18, 7.7, 22, 0.35, 3.2]
  ];
  lanes.forEach((args) => box(model, 'ivory', ...args));

  const buildings = [
    [-11, 2.3, -8.8, 4.4, 4.6, 5.5], [-3.8, 1.65, -10.5, 5.4, 3.3, 3.8],
    [4.9, 2.5, -10.1, 5.2, 5, 4.4], [11.1, 1.85, -8.8, 3.4, 3.7, 5.4],
    [-11, 2.65, 9.7, 4.2, 5.3, 4.7], [-3.8, 1.9, 10.5, 5.1, 3.8, 3.2],
    [6.2, 2.1, 10.4, 6.2, 4.2, 3.2], [11.3, 3.05, 7.7, 3.1, 6.1, 5.1],
    [-3.3, 1.25, 1.6, 3.5, 2.5, 3.2], [5.2, 1.45, -1.5, 3.8, 2.9, 3.5]
  ];
  buildings.forEach((building, index) => {
    box(model, index % 3 === 1 ? 'ivory' : 'teal', ...building);
    box(model, 'graphite', building[0], building[1] + building[4] / 2 + 0.17, building[2], building[3] + 0.32, 0.34, building[5] + 0.32);
    box(model, 'copper', building[0], building[1] + 0.25, building[2] + building[5] / 2 + 0.06, building[3] * 0.54, 0.18, 0.15);
  });

  const towers = [[-10,6,-9], [5,6.1,-10], [11.1,6.8,7.7]];
  towers.forEach(([x,y,z]) => {
    cylinder(model, 'copper', x, y, z, 0.26, 4.2, 8);
    cylinder(model, 'signal', x, y + 2.25, z, 0.48, 0.18, 12);
    box(model, 'ivory', x, y + 1.55, z, 1.2, 0.14, 1.2);
  });

  const pipes = [
    [-12.2,1.2,-3.3,5.8,'z'], [-5.4,.8,-11.5,4.2,'x'], [8.9,1,-11.3,4,'x'],
    [-10.8,1.1,3.2,5.5,'z'], [10.6,.95,1.4,4.8,'z'], [2.4,.75,11.2,5,'x']
  ];
  pipes.forEach(([x,y,z,length,axis]) => {
    cylinder(model, 'copper', x, y, z, 0.16, length, 8, axis);
    cylinder(model, 'ivory', x, y, z, 0.24, 0.22, 8, axis);
  });

  const props = [
    [-6, .55, -9],[-8.8,.55,-5],[-1,.55,-10.3],[2,.55,-9.2],[9.4,.55,-6],
    [-10,.55,5],[-5,.55,8.3],[4,.55,8.6],[9,.55,5.6],[2,.55,2.6],[-2,.55,-3]
  ];
  props.forEach(([x,y,z], index) => {
    box(model, index % 2 ? 'copper' : 'teal', x, y, z, 1.05, 1.1, 1.05);
    box(model, 'ivory', x, y + .25, z + .53, .7, .1, .06);
  });

  for (const relay of [
    [-8,5],[-2,-7],[6,-6],[9,4],[1,8]
  ]) {
    cylinder(model, 'graphite', relay[0], .45, relay[1], .7, .9, 12);
    cylinder(model, 'copper', relay[0], 1.05, relay[1], .28, .7, 10);
    box(model, 'signal', relay[0], 1.48, relay[1], .48, .18, .48);
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = i / 18 * Math.PI * 2;
    const radius = 11 + (i % 3) * .6;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    cylinder(model, i % 4 === 0 ? 'signal' : 'copper', x, 1.25, z, .09, 2.5, 6);
    box(model, 'ivory', x, 2.48, z, .34, .18, .34);
  }
  return model;
}

function buildDrone() {
  const model = new Model('Mender Drone');
  cylinder(model, 'teal', 0, 0, 0, .72, .42, 12);
  cylinder(model, 'ivory', 0, .25, 0, .45, .24, 10);
  box(model, 'graphite', 0, -.3, 0, .72, .26, .72);
  box(model, 'signal', 0, .42, .2, .26, .12, .18);
  const arms = [[.95,0,0],[-.95,0,0],[0,0,.95],[0,0,-.95]];
  arms.forEach(([x,y,z], index) => {
    box(model, 'copper', x / 2, y, z / 2, Math.abs(x) + .25, .13, Math.abs(z) + .25);
    cylinder(model, 'graphite', x, .02, z, .42, .1, 12);
    cylinder(model, 'signal', x, .1, z, .13, .08, 8);
    if (index < 2) box(model, 'ivory', x, -.2, z, .16, .55, .16);
  });
  cylinder(model, 'copper', 0, -.55, .38, .13, .52, 8);
  box(model, 'ivory', 0, -.86, .38, .4, .16, .28);
  return model;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makePng(width, height, pixel) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r,g,b,a = 255] = pixel(x, y);
      const offset = row + 1 + x * 4;
      raw[offset] = r; raw[offset + 1] = g; raw[offset + 2] = b; raw[offset + 3] = a;
    }
  }
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function addBufferView(chunks, bufferViews, typedArray, target) {
  const pad = (4 - (chunks.reduce((sum, chunk) => sum + chunk.length, 0) % 4)) % 4;
  if (pad) chunks.push(Buffer.alloc(pad));
  const byteOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const data = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength);
  chunks.push(data);
  const index = bufferViews.length;
  bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length, target });
  return index;
}

function minMax(values, stride) {
  const min = Array(stride).fill(Infinity);
  const max = Array(stride).fill(-Infinity);
  for (let i = 0; i < values.length; i += stride) {
    for (let j = 0; j < stride; j += 1) {
      min[j] = Math.min(min[j], values[i + j]);
      max[j] = Math.max(max[j], values[i + j]);
    }
  }
  return { min, max };
}

async function exportModel(model, stem) {
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  const primitives = [];
  const audit = { model: model.name, uvRange: [Infinity, Infinity, -Infinity, -Infinity], primitives: [] };

  for (const [material, part] of model.parts) {
    const positionView = addBufferView(chunks, bufferViews, new Float32Array(part.positions), 34962);
    const normalView = addBufferView(chunks, bufferViews, new Float32Array(part.normals), 34962);
    const uvView = addBufferView(chunks, bufferViews, new Float32Array(part.uvs), 34962);
    const indexView = addBufferView(chunks, bufferViews, new Uint16Array(part.indices), 34963);
    const positionBounds = minMax(part.positions, 3);
    const uvBounds = minMax(part.uvs, 2);
    const positionAccessor = accessors.push({ bufferView: positionView, componentType: 5126, count: part.positions.length / 3, type: 'VEC3', ...positionBounds }) - 1;
    const normalAccessor = accessors.push({ bufferView: normalView, componentType: 5126, count: part.normals.length / 3, type: 'VEC3' }) - 1;
    const uvAccessor = accessors.push({ bufferView: uvView, componentType: 5126, count: part.uvs.length / 2, type: 'VEC2', ...uvBounds }) - 1;
    const indexAccessor = accessors.push({ bufferView: indexView, componentType: 5123, count: part.indices.length, type: 'SCALAR', min: [0], max: [part.positions.length / 3 - 1] }) - 1;
    primitives.push({
      attributes: { POSITION: positionAccessor, NORMAL: normalAccessor, TEXCOORD_0: uvAccessor },
      indices: indexAccessor,
      material: MATERIALS[material].index,
      mode: 4,
      extras: { materialRole: material, uvIslandCount: part.islands.length, uvPolicy: 'unique packed face islands' }
    });
    audit.uvRange[0] = Math.min(audit.uvRange[0], uvBounds.min[0]);
    audit.uvRange[1] = Math.min(audit.uvRange[1], uvBounds.min[1]);
    audit.uvRange[2] = Math.max(audit.uvRange[2], uvBounds.max[0]);
    audit.uvRange[3] = Math.max(audit.uvRange[3], uvBounds.max[1]);
    audit.primitives.push({
      material,
      vertices: part.positions.length / 3,
      triangles: part.indices.length / 3,
      islandCount: part.islands.length,
      uvRange: [uvBounds.min[0], uvBounds.min[1], uvBounds.max[0], uvBounds.max[1]]
    });
  }

  const binary = Buffer.concat(chunks);
  const materials = [
    ['Oxidized Teal Metal', 0.92, 0.82, null],
    ['Warm Ceramic Composite', 0.06, 0.94, null],
    ['Graphite Service Floor', 0.02, 0.92, null],
    ['Aged Copper Machinery', 0.92, 0.72, null],
    ['Amber Signal Glass', 0.35, 0.35, [1, .42, .06]]
  ].map(([name, metallicFactor, roughnessFactor, emissiveFactor]) => ({
    name,
    pbrMetallicRoughness: {
      baseColorTexture: { index: 0 },
      metallicRoughnessTexture: { index: 1 },
      metallicFactor,
      roughnessFactor
    },
    occlusionTexture: { index: 1, strength: 1 },
    ...(emissiveFactor ? { emissiveTexture: { index: 2 }, emissiveFactor } : {})
  }));
  const gltf = {
    asset: { version: '2.0', generator: 'AstraCraft procedural model studio', copyright: 'AstraCraft project asset' },
    scene: 0,
    scenes: [{ name: `${model.name} Scene`, nodes: [0] }],
    nodes: [{ name: model.name, mesh: 0 }],
    meshes: [{ name: model.name, primitives }],
    materials,
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images: [
      { uri: 'repair-atlas-basecolor.png', name: 'Repair Atlas Base Color' },
      { uri: 'repair-atlas-orm.png', name: 'Repair Atlas Occlusion Roughness Metallic' },
      { uri: 'repair-atlas-emissive.png', name: 'Repair Atlas Emissive' }
    ],
    textures: [{ sampler: 0, source: 0 }, { sampler: 0, source: 1 }, { sampler: 0, source: 2 }],
    buffers: [{ uri: `${stem}.bin`, byteLength: binary.length }],
    bufferViews,
    accessors,
    extras: {
      pbrWorkflow: 'metallic-roughness',
      uvPolicy: '0-1 range, non-overlapping face islands per primitive',
      textureLicense: 'Project-generated with OpenAI ImageGen; prompt in docs/imagegen-prompts.md'
    }
  };
  await writeFile(join(OUT, `${stem}.bin`), binary);
  await writeFile(join(OUT, `${stem}.gltf`), `${JSON.stringify(gltf, null, 2)}\n`);
  return audit;
}

await mkdir(OUT, { recursive: true });
await readFile(SOURCE);
await copyFile(SOURCE, join(OUT, 'repair-atlas-basecolor.png'));

const size = 512;
const orm = makePng(size, size, (x, y) => {
  const left = x < size / 2;
  const top = y < size / 2;
  const seed = ((x * 73856093) ^ (y * 19349663)) >>> 0;
  const noise = (seed % 17) - 8;
  let roughness = 205;
  let metallic = 0;
  if (top && left) { roughness = 150; metallic = 230; }
  else if (top) { roughness = 218; metallic = 12; }
  else if (left) { roughness = 232; metallic = 4; }
  else { roughness = 174; metallic = 238; }
  return [245, Math.max(0, Math.min(255, roughness + noise)), metallic, 255];
});
const emissive = makePng(size, size, (x, y) => {
  const line = x % 64 < 5 || y % 64 < 5;
  const pulse = Math.max(0, Math.sin((x + y) * .045));
  return line ? [255, 150 + Math.round(pulse * 60), 35, 255] : [112, 41, 8, 255];
});
await writeFile(join(OUT, 'repair-atlas-orm.png'), orm);
await writeFile(join(OUT, 'repair-atlas-emissive.png'), emissive);

const audits = [];
audits.push(await exportModel(buildDistrict(), 'repair-district'));
audits.push(await exportModel(buildDrone(), 'mender-drone'));
await writeFile(join(OUT, 'model-audit.json'), `${JSON.stringify({ schemaVersion: 1, models: audits }, null, 2)}\n`);
console.log(`Generated ${audits.length} glTF 2.0 assets in ${OUT}`);
