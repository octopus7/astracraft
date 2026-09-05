import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const MATERIALS = [
  { key: "blueHull", name: "Blue Hull", tile: 0, metallic: 0.78, roughness: 0.62 },
  { key: "darkPanel", name: "Dark Service Panel", tile: 1, metallic: 0.86, roughness: 0.58 },
  { key: "copper", name: "Oxidized Copper", tile: 2, metallic: 0.72, roughness: 0.72 },
  { key: "ceramic", name: "Ceramic White", tile: 3, metallic: 0.18, roughness: 0.68 },
  { key: "safetyYellow", name: "Safety Yellow", tile: 4, metallic: 0.5, roughness: 0.7 },
  { key: "hazard", name: "Hazard Stripe", tile: 5, metallic: 0.42, roughness: 0.74 },
  { key: "rubber", name: "Industrial Rubber", tile: 6, metallic: 0.05, roughness: 0.96 },
  { key: "brushedSteel", name: "Brushed Steel", tile: 7, metallic: 0.94, roughness: 0.44 },
  { key: "concrete", name: "Lunar Concrete", tile: 8, metallic: 0.02, roughness: 0.98 },
  { key: "tealPaint", name: "Teal Utility Paint", tile: 9, metallic: 0.5, roughness: 0.66 },
  { key: "orangePaint", name: "Rescue Orange", tile: 10, metallic: 0.5, roughness: 0.64 },
  { key: "redPaint", name: "Oxide Red", tile: 11, metallic: 0.48, roughness: 0.7 },
  { key: "cyanCircuit", name: "Cyan Diagnostic Light", tile: 12, metallic: 0.3, roughness: 0.3, emissive: [0.35, 0.9, 1] },
  { key: "amberCircuit", name: "Amber Work Light", tile: 13, metallic: 0.32, roughness: 0.36, emissive: [1, 0.42, 0.08] },
  { key: "cleanSteel", name: "Clean Structural Steel", tile: 14, metallic: 0.96, roughness: 0.38 },
  { key: "solarCell", name: "Photovoltaic Cell", tile: 15, metallic: 0.38, roughness: 0.3 },
];

const materialLookup = new Map(MATERIALS.map((material, index) => [material.key, { ...material, index }]));

function normalize(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function subtract(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function rotate(vector, rotation = [0, 0, 0]) {
  let [x, y, z] = vector;
  const [rx, ry, rz] = rotation;

  let sine = Math.sin(rx);
  let cosine = Math.cos(rx);
  [y, z] = [y * cosine - z * sine, y * sine + z * cosine];

  sine = Math.sin(ry);
  cosine = Math.cos(ry);
  [x, z] = [x * cosine + z * sine, -x * sine + z * cosine];

  sine = Math.sin(rz);
  cosine = Math.cos(rz);
  [x, y] = [x * cosine - y * sine, x * sine + y * cosine];
  return [x, y, z];
}

function transformPoint(point, center, rotation) {
  const transformed = rotate(point, rotation);
  return [transformed[0] + center[0], transformed[1] + center[1], transformed[2] + center[2]];
}

class UvAllocator {
  constructor(cellsPerTile = 24, gutterRatio = 0.09) {
    this.cellsPerTile = cellsPerTile;
    this.gutterRatio = gutterRatio;
    this.usage = new Uint16Array(16);
  }

  allocate(tile) {
    if (!Number.isInteger(tile) || tile < 0 || tile >= 16) throw new Error(`Invalid atlas tile ${tile}.`);
    const index = this.usage[tile];
    const capacity = this.cellsPerTile ** 2;
    if (index >= capacity) {
      throw new Error(`Atlas tile ${tile} exceeded ${capacity} non-overlapping UV islands.`);
    }
    this.usage[tile] += 1;

    const atlasTileSize = 0.25;
    const cellSize = atlasTileSize / this.cellsPerTile;
    const tileColumn = tile % 4;
    const tileRow = Math.floor(tile / 4);
    const cellColumn = index % this.cellsPerTile;
    const cellRow = Math.floor(index / this.cellsPerTile);
    const gutter = cellSize * this.gutterRatio;
    const u0 = tileColumn * atlasTileSize + cellColumn * cellSize + gutter;
    const v0 = tileRow * atlasTileSize + cellRow * cellSize + gutter;
    const u1 = tileColumn * atlasTileSize + (cellColumn + 1) * cellSize - gutter;
    const v1 = tileRow * atlasTileSize + (cellRow + 1) * cellSize - gutter;
    return { u0, v0, u1, v1, tile, island: index };
  }
}

export class MeshBuilder {
  constructor(name) {
    this.name = name;
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.indices = new Map(MATERIALS.map((material) => [material.key, []]));
    this.uvAllocator = new UvAllocator();
  }

  addQuad(vertices, normals, materialKey) {
    const material = materialLookup.get(materialKey);
    if (!material) throw new Error(`Unknown material ${materialKey}.`);
    if (vertices.length !== 4) throw new Error("A quad requires four vertices.");
    const normalList = Array.isArray(normals[0]) ? normals : [normals, normals, normals, normals];
    const rectangle = this.uvAllocator.allocate(material.tile);
    const quadUvs = [
      [rectangle.u0, rectangle.v1],
      [rectangle.u0, rectangle.v0],
      [rectangle.u1, rectangle.v0],
      [rectangle.u1, rectangle.v1],
    ];
    const base = this.positions.length / 3;
    for (let vertex = 0; vertex < 4; vertex += 1) {
      this.positions.push(...vertices[vertex]);
      this.normals.push(...normalize(normalList[vertex]));
      this.uvs.push(...quadUvs[vertex]);
    }
    this.indices.get(materialKey).push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  addTriangle(vertices, normals, materialKey) {
    const material = materialLookup.get(materialKey);
    if (!material) throw new Error(`Unknown material ${materialKey}.`);
    if (vertices.length !== 3) throw new Error("A triangle requires three vertices.");
    const normalList = Array.isArray(normals[0]) ? normals : [normals, normals, normals];
    const rectangle = this.uvAllocator.allocate(material.tile);
    const triangleUvs = [
      [rectangle.u0, rectangle.v1],
      [rectangle.u1, rectangle.v1],
      [(rectangle.u0 + rectangle.u1) / 2, rectangle.v0],
    ];
    const base = this.positions.length / 3;
    for (let vertex = 0; vertex < 3; vertex += 1) {
      this.positions.push(...vertices[vertex]);
      this.normals.push(...normalize(normalList[vertex]));
      this.uvs.push(...triangleUvs[vertex]);
    }
    this.indices.get(materialKey).push(base, base + 1, base + 2);
  }

  addBox({ center, size, material = "darkPanel", rotation = [0, 0, 0] }) {
    const [halfX, halfY, halfZ] = size.map((dimension) => dimension / 2);
    const faces = [
      { n: [1, 0, 0], v: [[halfX, -halfY, -halfZ], [halfX, halfY, -halfZ], [halfX, halfY, halfZ], [halfX, -halfY, halfZ]] },
      { n: [-1, 0, 0], v: [[-halfX, -halfY, halfZ], [-halfX, halfY, halfZ], [-halfX, halfY, -halfZ], [-halfX, -halfY, -halfZ]] },
      { n: [0, 1, 0], v: [[-halfX, halfY, -halfZ], [-halfX, halfY, halfZ], [halfX, halfY, halfZ], [halfX, halfY, -halfZ]] },
      { n: [0, -1, 0], v: [[-halfX, -halfY, halfZ], [-halfX, -halfY, -halfZ], [halfX, -halfY, -halfZ], [halfX, -halfY, halfZ]] },
      { n: [0, 0, 1], v: [[-halfX, -halfY, halfZ], [halfX, -halfY, halfZ], [halfX, halfY, halfZ], [-halfX, halfY, halfZ]] },
      { n: [0, 0, -1], v: [[halfX, -halfY, -halfZ], [-halfX, -halfY, -halfZ], [-halfX, halfY, -halfZ], [halfX, halfY, -halfZ]] },
    ];
    for (const face of faces) {
      this.addQuad(
        face.v.map((vertex) => transformPoint(vertex, center, rotation)),
        rotate(face.n, rotation),
        material,
      );
    }
  }

  addCylinder({ center, radius, height, material = "brushedSteel", segments = 12, rotation = [0, 0, 0], cap = true, topRadius = radius }) {
    const halfHeight = height / 2;
    const slope = (radius - topRadius) / height;
    for (let segment = 0; segment < segments; segment += 1) {
      const angle0 = (segment / segments) * Math.PI * 2;
      const angle1 = ((segment + 1) / segments) * Math.PI * 2;
      const bottom0 = [Math.cos(angle0) * radius, -halfHeight, Math.sin(angle0) * radius];
      const top0 = [Math.cos(angle0) * topRadius, halfHeight, Math.sin(angle0) * topRadius];
      const top1 = [Math.cos(angle1) * topRadius, halfHeight, Math.sin(angle1) * topRadius];
      const bottom1 = [Math.cos(angle1) * radius, -halfHeight, Math.sin(angle1) * radius];
      const normal0 = normalize([Math.cos(angle0), slope, Math.sin(angle0)]);
      const normal1 = normalize([Math.cos(angle1), slope, Math.sin(angle1)]);
      this.addQuad(
        [bottom0, top0, top1, bottom1].map((vertex) => transformPoint(vertex, center, rotation)),
        [normal0, normal0, normal1, normal1].map((normal) => rotate(normal, rotation)),
        material,
      );
      if (cap && topRadius > 0) {
        this.addTriangle(
          [[0, halfHeight, 0], top1, top0].map((vertex) => transformPoint(vertex, center, rotation)),
          rotate([0, 1, 0], rotation),
          material,
        );
      }
      if (cap && radius > 0) {
        this.addTriangle(
          [[0, -halfHeight, 0], bottom0, bottom1].map((vertex) => transformPoint(vertex, center, rotation)),
          rotate([0, -1, 0], rotation),
          material,
        );
      }
    }
  }

  addTorus({ center, majorRadius, tubeRadius, material = "brushedSteel", majorSegments = 16, minorSegments = 6, rotation = [0, 0, 0] }) {
    const point = (majorAngle, minorAngle) => {
      const radial = majorRadius + tubeRadius * Math.cos(minorAngle);
      return [radial * Math.cos(majorAngle), tubeRadius * Math.sin(minorAngle), radial * Math.sin(majorAngle)];
    };
    const normal = (majorAngle, minorAngle) => [
      Math.cos(minorAngle) * Math.cos(majorAngle),
      Math.sin(minorAngle),
      Math.cos(minorAngle) * Math.sin(majorAngle),
    ];

    for (let major = 0; major < majorSegments; major += 1) {
      const major0 = (major / majorSegments) * Math.PI * 2;
      const major1 = ((major + 1) / majorSegments) * Math.PI * 2;
      for (let minor = 0; minor < minorSegments; minor += 1) {
        const minor0 = (minor / minorSegments) * Math.PI * 2;
        const minor1 = ((minor + 1) / minorSegments) * Math.PI * 2;
        const points = [point(major0, minor0), point(major0, minor1), point(major1, minor1), point(major1, minor0)];
        const normals = [normal(major0, minor0), normal(major0, minor1), normal(major1, minor1), normal(major1, minor0)];
        this.addQuad(
          points.map((vertex) => transformPoint(vertex, center, rotation)),
          normals.map((value) => rotate(value, rotation)),
          material,
        );
      }
    }
  }

  addBeam({ start, end, thickness, material = "cleanSteel" }) {
    const delta = subtract(end, start);
    const length = Math.hypot(...delta);
    const center = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2, (start[2] + end[2]) / 2];
    const yaw = Math.atan2(-delta[2], delta[0]);
    const pitch = Math.atan2(delta[1], Math.hypot(delta[0], delta[2]));
    this.addBox({ center, size: [length, thickness, thickness], material, rotation: [0, yaw, pitch] });
  }

  stats() {
    const triangles = [...this.indices.values()].reduce((sum, indices) => sum + indices.length / 3, 0);
    return {
      vertices: this.positions.length / 3,
      triangles,
      uvIslands: [...this.uvAllocator.usage].reduce((sum, count) => sum + count, 0),
      materialPrimitives: [...this.indices.values()].filter((indices) => indices.length > 0).length,
    };
  }
}

function floatBuffer(values) {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => buffer.writeFloatLE(value, index * 4));
  return buffer;
}

function uintBuffer(values) {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => buffer.writeUInt32LE(value, index * 4));
  return buffer;
}

function calculateBounds(values, components) {
  const minimum = new Array(components).fill(Number.POSITIVE_INFINITY);
  const maximum = new Array(components).fill(Number.NEGATIVE_INFINITY);
  for (let index = 0; index < values.length; index += components) {
    for (let component = 0; component < components; component += 1) {
      minimum[component] = Math.min(minimum[component], values[index + component]);
      maximum[component] = Math.max(maximum[component], values[index + component]);
    }
  }
  return { minimum, maximum };
}

function pad4(buffer) {
  const remainder = buffer.length % 4;
  return remainder === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(4 - remainder)]);
}

export async function writeGltf({
  builder,
  outputDirectory,
  basename,
  markers = [],
  gameplay = {},
  texturePrefix = "../textures/",
}) {
  await mkdir(outputDirectory, { recursive: true });
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let byteOffset = 0;

  const append = (buffer, target) => {
    const padded = pad4(buffer);
    const view = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: buffer.length, target });
    chunks.push(padded);
    byteOffset += padded.length;
    return view;
  };

  const positionView = append(floatBuffer(builder.positions), 34962);
  const normalView = append(floatBuffer(builder.normals), 34962);
  const uvView = append(floatBuffer(builder.uvs), 34962);
  const positionBounds = calculateBounds(builder.positions, 3);
  const uvBounds = calculateBounds(builder.uvs, 2);

  const positionAccessor = accessors.length;
  accessors.push({
    bufferView: positionView,
    byteOffset: 0,
    componentType: 5126,
    count: builder.positions.length / 3,
    type: "VEC3",
    min: positionBounds.minimum,
    max: positionBounds.maximum,
  });
  const normalAccessor = accessors.length;
  accessors.push({ bufferView: normalView, byteOffset: 0, componentType: 5126, count: builder.normals.length / 3, type: "VEC3" });
  const uvAccessor = accessors.length;
  accessors.push({
    bufferView: uvView,
    byteOffset: 0,
    componentType: 5126,
    count: builder.uvs.length / 2,
    type: "VEC2",
    min: uvBounds.minimum,
    max: uvBounds.maximum,
  });

  const primitives = [];
  for (const [materialIndex, material] of MATERIALS.entries()) {
    const values = builder.indices.get(material.key);
    if (!values?.length) continue;
    const indexView = append(uintBuffer(values), 34963);
    const indexAccessor = accessors.length;
    accessors.push({
      bufferView: indexView,
      byteOffset: 0,
      componentType: 5125,
      count: values.length,
      type: "SCALAR",
      min: [Math.min(...values)],
      max: [Math.max(...values)],
    });
    primitives.push({
      attributes: { POSITION: positionAccessor, NORMAL: normalAccessor, TEXCOORD_0: uvAccessor },
      indices: indexAccessor,
      material: materialIndex,
      mode: 4,
    });
  }

  const nodes = [{ name: builder.name, mesh: 0, extras: { role: "renderGeometry", collision: "mesh" } }];
  for (const marker of markers) {
    nodes.push({
      name: marker.name,
      translation: marker.translation,
      ...(marker.rotation ? { rotation: marker.rotation } : {}),
      extras: { role: marker.role ?? "marker", ...(marker.extras ?? {}) },
    });
  }

  const imageUris = [
    "district-atlas-basecolor.png",
    "district-atlas-metallic-roughness.png",
    "district-atlas-normal.png",
    "district-atlas-emissive.png",
  ].map((filename) => `${texturePrefix}${filename}`);

  const gltfMaterials = MATERIALS.map((material) => ({
    name: material.name,
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: { index: 0, texCoord: 0 },
      metallicFactor: material.metallic,
      roughnessFactor: material.roughness,
      metallicRoughnessTexture: { index: 1, texCoord: 0 },
    },
    normalTexture: { index: 2, texCoord: 0, scale: 0.72 },
    occlusionTexture: { index: 1, texCoord: 0, strength: 0.62 },
    emissiveTexture: { index: 3, texCoord: 0 },
    emissiveFactor: material.emissive ?? [0, 0, 0],
    alphaMode: "OPAQUE",
    doubleSided: false,
    extras: { atlasTile: material.tile, uvSet: 0 },
  }));

  const binary = Buffer.concat(chunks);
  const stats = builder.stats();
  const document = {
    asset: {
      version: "2.0",
      generator: "AstraCraft deterministic glTF pipeline 1.0",
      copyright: "Original procedural geometry and project-owned texture atlas",
      extras: {
        coordinateSystem: "right-handed, +Y up, +Z forward",
        units: "meters",
        uvPolicy: "TEXCOORD_0; unique non-overlapping islands inside 0-1; atlas gutters",
      },
    },
    scene: 0,
    scenes: [{ name: `${builder.name} Scene`, nodes: nodes.map((_, index) => index), extras: { gameplay } }],
    nodes,
    meshes: [{ name: `${builder.name} Mesh`, primitives, extras: stats }],
    materials: gltfMaterials,
    samplers: [{ name: "Atlas clamp sampler", magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
    images: imageUris.map((uri, index) => ({
      name: ["Base Color Atlas", "Metallic Roughness Atlas", "Normal Atlas", "Emissive Atlas"][index],
      uri,
    })),
    textures: imageUris.map((_, index) => ({ sampler: 0, source: index })),
    buffers: [{ name: `${builder.name} geometry`, uri: `${basename}.bin`, byteLength: binary.length }],
    bufferViews,
    accessors,
  };

  await writeFile(path.join(outputDirectory, `${basename}.bin`), binary);
  await writeFile(path.join(outputDirectory, `${basename}.gltf`), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return { document, binary, stats };
}

export function faceNormal(a, b, c) {
  return normalize(cross(subtract(b, a), subtract(c, a)));
}
