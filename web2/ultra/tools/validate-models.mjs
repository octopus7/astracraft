import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "./lib/png.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ULTRA_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const EXPECTED_MODELS = ["repair-district.gltf", "salvage-drone.gltf", "service-rover.gltf"];
const COMPONENT_BYTES = new Map([[5120, 1], [5121, 1], [5122, 2], [5123, 2], [5125, 4], [5126, 4]]);
const TYPE_COMPONENTS = new Map([["SCALAR", 1], ["VEC2", 2], ["VEC3", 3], ["VEC4", 4], ["MAT2", 4], ["MAT3", 9], ["MAT4", 16]]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readComponent(buffer, offset, componentType) {
  if (componentType === 5120) return buffer.readInt8(offset);
  if (componentType === 5121) return buffer.readUInt8(offset);
  if (componentType === 5122) return buffer.readInt16LE(offset);
  if (componentType === 5123) return buffer.readUInt16LE(offset);
  if (componentType === 5125) return buffer.readUInt32LE(offset);
  if (componentType === 5126) return buffer.readFloatLE(offset);
  throw new Error(`Unsupported accessor component type ${componentType}.`);
}

export function readAccessor(document, binary, accessorIndex) {
  const accessor = document.accessors?.[accessorIndex];
  invariant(accessor, `Accessor ${accessorIndex} does not exist.`);
  invariant(accessor.sparse === undefined, `Accessor ${accessorIndex}: sparse accessors are not supported by this verifier.`);
  const view = document.bufferViews?.[accessor.bufferView];
  invariant(view, `Accessor ${accessorIndex}: bufferView ${accessor.bufferView} does not exist.`);
  const componentBytes = COMPONENT_BYTES.get(accessor.componentType);
  const components = TYPE_COMPONENTS.get(accessor.type);
  invariant(componentBytes && components, `Accessor ${accessorIndex}: unsupported component/type combination.`);
  const packedStride = componentBytes * components;
  const stride = view.byteStride ?? packedStride;
  invariant(stride >= packedStride, `Accessor ${accessorIndex}: byteStride is smaller than packed data.`);
  const firstByte = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const lastByte = firstByte + Math.max(0, accessor.count - 1) * stride + packedStride;
  invariant(lastByte <= (view.byteOffset ?? 0) + view.byteLength, `Accessor ${accessorIndex}: data exceeds its bufferView.`);
  invariant(lastByte <= binary.length, `Accessor ${accessorIndex}: data exceeds the external buffer.`);

  const values = new Array(accessor.count * components);
  for (let element = 0; element < accessor.count; element += 1) {
    for (let component = 0; component < components; component += 1) {
      values[element * components + component] = readComponent(
        binary,
        firstByte + element * stride + component * componentBytes,
        accessor.componentType,
      );
    }
  }
  return { accessor, values, components };
}

function signedArea(polygon) {
  let sum = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    sum += current[0] * next[1] - current[1] * next[0];
  }
  return sum / 2;
}

function edgeCross(a, b, point) {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
}

function lineIntersection(start, end, clipStart, clipEnd) {
  const segmentX = end[0] - start[0];
  const segmentY = end[1] - start[1];
  const clipX = clipEnd[0] - clipStart[0];
  const clipY = clipEnd[1] - clipStart[1];
  const denominator = segmentX * clipY - segmentY * clipX;
  if (Math.abs(denominator) < 1e-16) return end;
  const deltaX = clipStart[0] - start[0];
  const deltaY = clipStart[1] - start[1];
  const t = (deltaX * clipY - deltaY * clipX) / denominator;
  return [start[0] + t * segmentX, start[1] + t * segmentY];
}

function clipPolygon(subject, clipTriangle) {
  let output = subject;
  const orientation = signedArea(clipTriangle) >= 0 ? 1 : -1;
  for (let edge = 0; edge < 3; edge += 1) {
    const clipStart = clipTriangle[edge];
    const clipEnd = clipTriangle[(edge + 1) % 3];
    const input = output;
    output = [];
    if (input.length === 0) break;
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      const previous = input[(index + input.length - 1) % input.length];
      const currentInside = orientation * edgeCross(clipStart, clipEnd, current) >= -1e-13;
      const previousInside = orientation * edgeCross(clipStart, clipEnd, previous) >= -1e-13;
      if (currentInside) {
        if (!previousInside) output.push(lineIntersection(previous, current, clipStart, clipEnd));
        output.push(current);
      } else if (previousInside) {
        output.push(lineIntersection(previous, current, clipStart, clipEnd));
      }
    }
  }
  return output;
}

export function trianglesOverlapArea(first, second) {
  const intersection = clipPolygon(first, second);
  return intersection.length >= 3 ? Math.abs(signedArea(intersection)) : 0;
}

function findUvOverlaps(triangles) {
  const resolution = 160;
  const buckets = new Map();
  const compared = new Set();
  const overlaps = [];
  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex += 1) {
    const triangle = triangles[triangleIndex];
    const minimumU = Math.min(...triangle.map((point) => point[0]));
    const maximumU = Math.max(...triangle.map((point) => point[0]));
    const minimumV = Math.min(...triangle.map((point) => point[1]));
    const maximumV = Math.max(...triangle.map((point) => point[1]));
    const minX = Math.max(0, Math.min(resolution - 1, Math.floor(minimumU * resolution)));
    const maxX = Math.max(0, Math.min(resolution - 1, Math.floor(maximumU * resolution)));
    const minY = Math.max(0, Math.min(resolution - 1, Math.floor(minimumV * resolution)));
    const maxY = Math.max(0, Math.min(resolution - 1, Math.floor(maximumV * resolution)));
    const candidates = new Set();
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const key = `${x}:${y}`;
        const bucket = buckets.get(key) ?? [];
        for (const candidate of bucket) candidates.add(candidate);
        bucket.push(triangleIndex);
        buckets.set(key, bucket);
      }
    }
    for (const candidate of candidates) {
      const pair = `${candidate}:${triangleIndex}`;
      if (compared.has(pair)) continue;
      compared.add(pair);
      const area = trianglesOverlapArea(triangles[candidate], triangle);
      if (area > 1e-10) overlaps.push({ first: candidate, second: triangleIndex, area });
    }
  }
  return overlaps;
}

function accessorBounds(values, components) {
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

function closeEnough(first, second, epsilon = 1e-5) {
  return first.length === second.length && first.every((value, index) => Math.abs(value - second[index]) <= epsilon);
}

async function validateModel(modelPath) {
  const gltfBytes = await readFile(modelPath);
  const document = JSON.parse(gltfBytes.toString("utf8"));
  const modelDirectory = path.dirname(modelPath);
  invariant(document.asset?.version === "2.0", `${path.basename(modelPath)}: asset.version must be 2.0.`);
  invariant(Number.isInteger(document.scene) && document.scenes?.[document.scene], `${path.basename(modelPath)}: default scene is missing.`);
  invariant(document.buffers?.length === 1, `${path.basename(modelPath)}: exactly one external buffer is required.`);
  const bufferDefinition = document.buffers[0];
  invariant(typeof bufferDefinition.uri === "string" && bufferDefinition.uri.endsWith(".bin") && !bufferDefinition.uri.startsWith("data:"), `${path.basename(modelPath)}: buffer must be an external .bin URI.`);
  const binary = await readFile(path.resolve(modelDirectory, bufferDefinition.uri));
  invariant(binary.length === bufferDefinition.byteLength, `${path.basename(modelPath)}: buffer byteLength mismatch.`);

  const occupiedViews = [];
  for (const [viewIndex, view] of (document.bufferViews ?? []).entries()) {
    invariant(view.buffer === 0, `${path.basename(modelPath)}: bufferView ${viewIndex} references another buffer.`);
    invariant((view.byteOffset ?? 0) % 4 === 0, `${path.basename(modelPath)}: bufferView ${viewIndex} is not 4-byte aligned.`);
    const start = view.byteOffset ?? 0;
    const end = start + view.byteLength;
    invariant(end <= binary.length, `${path.basename(modelPath)}: bufferView ${viewIndex} exceeds the binary.`);
    for (const occupied of occupiedViews) {
      invariant(end <= occupied.start || start >= occupied.end, `${path.basename(modelPath)}: bufferViews ${occupied.index} and ${viewIndex} overlap.`);
    }
    occupiedViews.push({ start, end, index: viewIndex });
  }

  invariant(document.images?.length === 4, `${path.basename(modelPath)}: four external PBR textures are required.`);
  const textureReports = [];
  for (const image of document.images) {
    invariant(typeof image.uri === "string" && image.uri.toLowerCase().endsWith(".png") && !image.uri.startsWith("data:"), `${path.basename(modelPath)}: images must be external PNG URIs.`);
    const texturePath = path.resolve(modelDirectory, image.uri);
    const bytes = await readFile(texturePath);
    const png = decodePng(bytes);
    invariant(png.width === png.height && png.width >= 256, `${image.uri}: texture must be square and at least 256 px.`);
    textureReports.push({ file: path.basename(image.uri), width: png.width, height: png.height, sha256: sha256(bytes) });
  }

  invariant(document.materials?.length === 16, `${path.basename(modelPath)}: the 4x4 atlas must expose 16 standard PBR materials.`);
  for (const [materialIndex, material] of document.materials.entries()) {
    const pbr = material.pbrMetallicRoughness;
    invariant(pbr?.baseColorTexture?.index === 0, `${path.basename(modelPath)}: material ${materialIndex} lacks baseColorTexture.`);
    invariant(pbr?.metallicRoughnessTexture?.index === 1, `${path.basename(modelPath)}: material ${materialIndex} lacks metallicRoughnessTexture.`);
    invariant(material.normalTexture?.index === 2, `${path.basename(modelPath)}: material ${materialIndex} lacks normalTexture.`);
    invariant(material.occlusionTexture?.index === 1, `${path.basename(modelPath)}: material ${materialIndex} lacks occlusionTexture.`);
    invariant(material.emissiveTexture?.index === 3, `${path.basename(modelPath)}: material ${materialIndex} lacks emissiveTexture.`);
    invariant(material.alphaMode === "OPAQUE", `${path.basename(modelPath)}: material ${materialIndex} must be opaque.`);
    invariant(material.extras?.atlasTile === materialIndex, `${path.basename(modelPath)}: material ${materialIndex} atlas metadata is inconsistent.`);
  }

  const allTriangles = [];
  let vertices = 0;
  let triangleCount = 0;
  const usedMaterials = new Set();
  for (const [meshIndex, mesh] of (document.meshes ?? []).entries()) {
    invariant(mesh.primitives?.length > 0, `${path.basename(modelPath)}: mesh ${meshIndex} has no primitives.`);
    for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
      invariant((primitive.mode ?? 4) === 4, `${path.basename(modelPath)}: primitive ${primitiveIndex} is not TRIANGLES.`);
      for (const attribute of ["POSITION", "NORMAL", "TEXCOORD_0"]) {
        invariant(Number.isInteger(primitive.attributes?.[attribute]), `${path.basename(modelPath)}: primitive ${primitiveIndex} lacks ${attribute}.`);
      }
      invariant(Number.isInteger(primitive.indices), `${path.basename(modelPath)}: primitive ${primitiveIndex} is not indexed.`);
      invariant(Number.isInteger(primitive.material), `${path.basename(modelPath)}: primitive ${primitiveIndex} has no PBR material.`);
      usedMaterials.add(primitive.material);
      const positions = readAccessor(document, binary, primitive.attributes.POSITION);
      const normals = readAccessor(document, binary, primitive.attributes.NORMAL);
      const uvs = readAccessor(document, binary, primitive.attributes.TEXCOORD_0);
      const indices = readAccessor(document, binary, primitive.indices);
      invariant(positions.components === 3 && normals.components === 3 && uvs.components === 2 && indices.components === 1, `${path.basename(modelPath)}: primitive ${primitiveIndex} accessor types are invalid.`);
      invariant(positions.accessor.count === normals.accessor.count && positions.accessor.count === uvs.accessor.count, `${path.basename(modelPath)}: attribute counts differ.`);
      invariant(indices.values.length % 3 === 0, `${path.basename(modelPath)}: index count is not divisible by three.`);
      invariant(positions.values.every(Number.isFinite) && normals.values.every(Number.isFinite) && uvs.values.every(Number.isFinite), `${path.basename(modelPath)}: non-finite vertex attribute.`);
      invariant(uvs.values.every((value) => value >= -1e-7 && value <= 1 + 1e-7), `${path.basename(modelPath)}: TEXCOORD_0 escapes the 0-1 range.`);
      invariant(indices.values.every((value) => Number.isInteger(value) && value >= 0 && value < positions.accessor.count), `${path.basename(modelPath)}: out-of-range index.`);
      for (let normalIndex = 0; normalIndex < normals.values.length; normalIndex += 3) {
        const length = Math.hypot(normals.values[normalIndex], normals.values[normalIndex + 1], normals.values[normalIndex + 2]);
        invariant(Math.abs(length - 1) < 1e-4, `${path.basename(modelPath)}: non-unit normal at vertex ${normalIndex / 3}.`);
      }
      const calculatedPositionBounds = accessorBounds(positions.values, 3);
      invariant(closeEnough(calculatedPositionBounds.minimum, positions.accessor.min), `${path.basename(modelPath)}: POSITION min is stale.`);
      invariant(closeEnough(calculatedPositionBounds.maximum, positions.accessor.max), `${path.basename(modelPath)}: POSITION max is stale.`);

      const atlasTile = document.materials[primitive.material].extras.atlasTile;
      const tileColumn = atlasTile % 4;
      const tileRow = Math.floor(atlasTile / 4);
      const tileMinimumU = tileColumn / 4;
      const tileMaximumU = (tileColumn + 1) / 4;
      const tileMinimumV = tileRow / 4;
      const tileMaximumV = (tileRow + 1) / 4;
      for (const index of indices.values) {
        const u = uvs.values[index * 2];
        const v = uvs.values[index * 2 + 1];
        invariant(u > tileMinimumU && u < tileMaximumU && v > tileMinimumV && v < tileMaximumV, `${path.basename(modelPath)}: material ${primitive.material} samples outside atlas tile ${atlasTile}.`);
      }

      for (let index = 0; index < indices.values.length; index += 3) {
        const triangle = indices.values.slice(index, index + 3).map((vertexIndex) => [uvs.values[vertexIndex * 2], uvs.values[vertexIndex * 2 + 1]]);
        invariant(Math.abs(signedArea(triangle)) > 1e-12, `${path.basename(modelPath)}: degenerate UV triangle.`);
        allTriangles.push(triangle);
      }
      vertices = Math.max(vertices, positions.accessor.count);
      triangleCount += indices.values.length / 3;
    }
  }

  const overlaps = findUvOverlaps(allTriangles);
  invariant(overlaps.length === 0, `${path.basename(modelPath)}: ${overlaps.length} UV triangle pairs overlap with positive area (first pair ${JSON.stringify(overlaps[0])}).`);
  invariant(document.nodes?.some((node) => node.extras?.role === "renderGeometry"), `${path.basename(modelPath)}: render geometry node metadata is missing.`);
  invariant(document.nodes?.some((node) => node.extras?.role !== "renderGeometry"), `${path.basename(modelPath)}: gameplay marker nodes are missing.`);

  return {
    file: path.basename(modelPath),
    gltfBytes: gltfBytes.length,
    binaryBytes: binary.length,
    sha256: { gltf: sha256(gltfBytes), binary: sha256(binary) },
    vertices,
    triangles: triangleCount,
    materialPrimitives: usedMaterials.size,
    uv: { minimum: [Math.min(...document.accessors.find((accessor) => accessor.type === "VEC2").min)], maximum: [Math.max(...document.accessors.find((accessor) => accessor.type === "VEC2").max)], overlapPairs: 0 },
    markers: document.nodes.filter((node) => node.extras?.role !== "renderGeometry").map((node) => node.name),
    textures: textureReports,
  };
}

export async function validateAssets(root = ULTRA_ROOT, { writeReport = false } = {}) {
  const modelDirectory = path.join(root, "assets", "models");
  const modelFiles = (await readdir(modelDirectory)).filter((filename) => filename.endsWith(".gltf")).sort();
  invariant(modelFiles.length === EXPECTED_MODELS.length, `Expected ${EXPECTED_MODELS.length} glTF files, found ${modelFiles.length}.`);
  invariant(EXPECTED_MODELS.every((filename, index) => filename === modelFiles[index]), `Unexpected glTF model set: ${modelFiles.join(", ")}.`);
  const models = [];
  for (const filename of modelFiles) models.push(await validateModel(path.join(modelDirectory, filename)));

  const report = {
    schemaVersion: 1,
    valid: true,
    profile: "glTF 2.0 external JSON + BIN + PNG; metallic-roughness PBR; Y-up meters",
    checks: [
      "external-buffer-bounds-and-alignment",
      "external-png-signatures-and-dimensions",
      "finite-position-normal-uv-accessors",
      "unit-length-normals",
      "indexed-triangle-bounds",
      "standard-pbr-texture-slots",
      "uvs-inside-0-1-and-assigned-atlas-tile",
      "positive-area-uv-triangle-overlap-zero",
      "gameplay-marker-nodes",
    ],
    models,
  };
  if (writeReport) {
    const reportPath = path.join(root, "docs", "model-validation-report.json");
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}

function parseArguments(argv) {
  let root = ULTRA_ROOT;
  let writeReport = true;
  for (let index = 0; index < argv.length; index += 1) {
    const [flag, inlineValue] = argv[index].split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    if (flag === "--root") root = path.resolve(value);
    else if (flag === "--no-report") writeReport = false;
    else throw new Error(`Unknown argument: ${argv[index]}`);
    if (inlineValue === undefined && flag !== "--no-report") index += 1;
  }
  return { root, writeReport };
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(SCRIPT_PATH)) {
  const options = parseArguments(process.argv.slice(2));
  const report = await validateAssets(options.root, { writeReport: options.writeReport });
  for (const model of report.models) {
    console.log(`PASS ${model.file}: ${model.vertices} vertices, ${model.triangles} triangles, ${model.materialPrimitives} materials, UV overlaps ${model.uv.overlapPairs}`);
  }
  const totals = report.models.reduce((summary, model) => ({ vertices: summary.vertices + model.vertices, triangles: summary.triangles + model.triangles }), { vertices: 0, triangles: 0 });
  console.log(`PASS glTF 2.0 asset pack: ${totals.vertices} vertices, ${totals.triangles} triangles, ${report.checks.length} validation groups`);
}

