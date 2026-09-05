import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MATERIALS, MeshBuilder, writeGltf } from "./lib/gltf-builder.mjs";
import { decodePng, encodeRgbaPng, resizeRgbaBilinear } from "./lib/png.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ULTRA_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

function parseArguments(argv) {
  const options = {
    outputRoot: ULTRA_ROOT,
    sourceBasecolor: path.join(ULTRA_ROOT, "assets", "textures", "district-atlas-imagegen.png"),
    overlayBasecolor: null,
    overlayOpacity: 0.72,
    textureSize: 1024,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const [flag, inlineValue] = argument.split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    if (flag === "--output-root") options.outputRoot = path.resolve(value);
    else if (flag === "--source-basecolor") options.sourceBasecolor = path.resolve(value);
    else if (flag === "--overlay-basecolor") options.overlayBasecolor = path.resolve(value);
    else if (flag === "--overlay-opacity") options.overlayOpacity = Number(value);
    else if (flag === "--texture-size") options.textureSize = Number(value);
    else if (flag === "--help") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
    if (inlineValue === undefined && flag !== "--help") index += 1;
  }
  if (!Number.isInteger(options.textureSize) || options.textureSize < 64 || options.textureSize > 4096) {
    throw new Error("--texture-size must be an integer from 64 to 4096.");
  }
  if (!Number.isFinite(options.overlayOpacity) || options.overlayOpacity < 0 || options.overlayOpacity > 1) {
    throw new Error("--overlay-opacity must be from 0 to 1.");
  }
  return options;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function makeFallbackAtlas(size) {
  const colors = [
    [54, 75, 88], [39, 43, 46], [125, 72, 39], [201, 199, 188],
    [211, 147, 22], [224, 154, 20], [42, 44, 44], [154, 157, 156],
    [112, 110, 104], [31, 129, 135], [208, 83, 22], [107, 43, 47],
    [13, 96, 119], [106, 65, 23], [186, 188, 183], [24, 40, 65],
  ];
  const pixels = new Uint8Array(size * size * 4);
  const tileSize = size / 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const column = Math.min(3, Math.floor(x / tileSize));
      const row = Math.min(3, Math.floor(y / tileSize));
      const tile = row * 4 + column;
      const localX = x % tileSize;
      const localY = y % tileSize;
      const border = localX < 5 || localY < 5 || localX >= tileSize - 5 || localY >= tileSize - 5;
      const seam = localX % Math.max(16, Math.floor(tileSize / 5)) < 2 || localY % Math.max(16, Math.floor(tileSize / 5)) < 2;
      const scratch = ((x * 29 + y * 17 + tile * 71) % 113) < 2;
      let [red, green, blue] = colors[tile];
      if (tile === 5 && ((localX + localY) % Math.max(20, Math.floor(tileSize / 4))) < tileSize / 8) {
        red = 30; green = 33; blue = 34;
      }
      if (tile === 12 && (localX % Math.max(20, Math.floor(tileSize / 6)) < 4 || localY % Math.max(20, Math.floor(tileSize / 6)) < 4)) {
        red = 19; green = 191; blue = 231;
      }
      if (tile === 13 && localX % Math.max(20, Math.floor(tileSize / 8)) < 6) {
        red = 247; green = 118; blue = 19;
      }
      const shade = border ? 0.48 : seam ? 0.72 : scratch ? 1.18 : 0.94 + (((x * 13 + y * 7) % 19) / 180);
      const target = (y * size + x) * 4;
      pixels[target] = clampByte(red * shade);
      pixels[target + 1] = clampByte(green * shade);
      pixels[target + 2] = clampByte(blue * shade);
      pixels[target + 3] = 255;
    }
  }
  return { width: size, height: size, pixels };
}

async function fileExists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

function blendOverlay(base, overlay, opacity) {
  const result = new Uint8Array(base.pixels);
  for (let index = 0; index < result.length; index += 4) {
    const alpha = (overlay.pixels[index + 3] / 255) * opacity;
    result[index] = clampByte(result[index] * (1 - alpha) + overlay.pixels[index] * alpha);
    result[index + 1] = clampByte(result[index + 1] * (1 - alpha) + overlay.pixels[index + 1] * alpha);
    result[index + 2] = clampByte(result[index + 2] * (1 - alpha) + overlay.pixels[index + 2] * alpha);
    result[index + 3] = 255;
  }
  return { width: base.width, height: base.height, pixels: result };
}

function derivePbrMaps(base) {
  const { width, height, pixels } = base;
  const metallicRoughness = new Uint8Array(width * height * 4);
  const normal = new Uint8Array(width * height * 4);
  const emissive = new Uint8Array(width * height * 4);
  const roughnessByTile = [178, 164, 198, 190, 186, 202, 236, 132, 238, 181, 175, 193, 110, 126, 118, 104];
  const metallicByTile = [220, 234, 205, 72, 166, 150, 18, 246, 8, 166, 174, 159, 95, 102, 250, 118];

  const luminance = (x, y) => {
    const clampedX = Math.max(0, Math.min(width - 1, x));
    const clampedY = Math.max(0, Math.min(height - 1, y));
    const offset = (clampedY * width + clampedX) * 4;
    return pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const tileColumn = Math.min(3, Math.floor((x / width) * 4));
      const tileRow = Math.min(3, Math.floor((y / height) * 4));
      const tile = tileRow * 4 + tileColumn;
      const gradientX = luminance(x + 1, y) - luminance(x - 1, y);
      const gradientY = luminance(x, y + 1) - luminance(x, y - 1);
      const edge = Math.min(90, (Math.abs(gradientX) + Math.abs(gradientY)) * 0.48);
      const noise = ((x * 19 + y * 23 + tile * 29) % 13) - 6;

      metallicRoughness[offset] = clampByte(255 - edge * 0.72);
      metallicRoughness[offset + 1] = clampByte(roughnessByTile[tile] + noise);
      metallicRoughness[offset + 2] = metallicByTile[tile];
      metallicRoughness[offset + 3] = 255;

      const nx = -gradientX * 0.016;
      const ny = -gradientY * 0.016;
      const inverseLength = 1 / Math.hypot(nx, ny, 1);
      normal[offset] = clampByte((nx * inverseLength * 0.5 + 0.5) * 255);
      normal[offset + 1] = clampByte((ny * inverseLength * 0.5 + 0.5) * 255);
      normal[offset + 2] = clampByte((inverseLength * 0.5 + 0.5) * 255);
      normal[offset + 3] = 255;

      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const cyanSignal = tile === 12 ? Math.max(0, Math.min(1, (green + blue - red * 1.35 - 90) / 230)) : 0;
      const amberSignal = tile === 13 ? Math.max(0, Math.min(1, (red + green * 0.25 - blue - 80) / 210)) : 0;
      const signal = Math.max(cyanSignal, amberSignal);
      emissive[offset] = clampByte(red * signal);
      emissive[offset + 1] = clampByte(green * signal);
      emissive[offset + 2] = clampByte(blue * signal);
      emissive[offset + 3] = 255;
    }
  }
  return { metallicRoughness, normal, emissive };
}

async function generateTextures(options) {
  const textureDirectory = path.join(options.outputRoot, "assets", "textures");
  await mkdir(textureDirectory, { recursive: true });
  let sourceBytes;
  let sourceImage;
  let sourceKind;
  if (await fileExists(options.sourceBasecolor)) {
    sourceBytes = await readFile(options.sourceBasecolor);
    sourceImage = decodePng(sourceBytes);
    sourceKind = "imagegen-or-replacement";
  } else {
    sourceImage = makeFallbackAtlas(options.textureSize);
    sourceBytes = encodeRgbaPng(sourceImage.width, sourceImage.height, sourceImage.pixels);
    sourceKind = "deterministic-fallback";
  }

  let base = resizeRgbaBilinear(sourceImage, options.textureSize, options.textureSize);
  let overlayHash = null;
  if (options.overlayBasecolor) {
    const overlayBytes = await readFile(options.overlayBasecolor);
    const overlay = resizeRgbaBilinear(decodePng(overlayBytes), options.textureSize, options.textureSize);
    base = blendOverlay(base, overlay, options.overlayOpacity);
    overlayHash = createHash("sha256").update(overlayBytes).digest("hex");
  }
  const maps = derivePbrMaps(base);
  const outputs = {
    baseColor: encodeRgbaPng(base.width, base.height, base.pixels),
    metallicRoughness: encodeRgbaPng(base.width, base.height, maps.metallicRoughness),
    normal: encodeRgbaPng(base.width, base.height, maps.normal),
    emissive: encodeRgbaPng(base.width, base.height, maps.emissive),
  };

  await Promise.all([
    writeFile(path.join(textureDirectory, "district-atlas-basecolor.png"), outputs.baseColor),
    writeFile(path.join(textureDirectory, "district-atlas-metallic-roughness.png"), outputs.metallicRoughness),
    writeFile(path.join(textureDirectory, "district-atlas-normal.png"), outputs.normal),
    writeFile(path.join(textureDirectory, "district-atlas-emissive.png"), outputs.emissive),
  ]);

  const provenance = {
    schemaVersion: 1,
    generatorVersion: "1.0.0",
    source: {
      kind: sourceKind,
      filename: path.basename(options.sourceBasecolor),
      sha256: createHash("sha256").update(sourceBytes).digest("hex"),
      width: sourceImage.width,
      height: sourceImage.height,
    },
    overlay: options.overlayBasecolor ? {
      filename: path.basename(options.overlayBasecolor),
      sha256: overlayHash,
      opacity: options.overlayOpacity,
    } : null,
    outputs: {
      width: base.width,
      height: base.height,
      baseColor: "district-atlas-basecolor.png",
      metallicRoughness: "district-atlas-metallic-roughness.png",
      normal: "district-atlas-normal.png",
      emissive: "district-atlas-emissive.png",
    },
  };
  await writeFile(path.join(textureDirectory, "atlas-provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`, "utf8");
  return provenance;
}

function addPipe(builder, center, radius, length, axis, material = "copper", segments = 10) {
  const rotation = axis === "x" ? [0, 0, Math.PI / 2] : axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  builder.addCylinder({ center, radius, height: length, material, segments, rotation });
}

function addContainer(builder, center, size, material) {
  builder.addBox({ center, size, material });
  const [width, height, depth] = size;
  for (const side of [-1, 1]) {
    builder.addBox({ center: [center[0] + side * width * 0.34, center[1], center[2] + depth * 0.506], size: [0.1, height * 0.86, 0.08], material: "cleanSteel" });
  }
  builder.addBox({ center: [center[0], center[1] + height * 0.32, center[2] + depth * 0.508], size: [width * 0.75, 0.1, 0.09], material: "hazard" });
}

function buildRepairDistrict() {
  const builder = new MeshBuilder("RepairDistrictGeometry");

  builder.addBox({ center: [0, -0.72, 0], size: [38, 1.4, 30], material: "concrete" });
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const floorMaterials = ["blueHull", "darkPanel", "brushedSteel", "concrete"];
      builder.addBox({
        center: [-12.8 + column * 6.4, 0.015, -10.2 + row * 6.8],
        size: [6.1, 0.08, 6.5],
        material: floorMaterials[(row * 3 + column) % floorMaterials.length],
      });
    }
  }

  for (const x of [-18.35, 18.35]) {
    builder.addBox({ center: [x, 0.15, 0], size: [0.42, 0.62, 29.2], material: "hazard" });
  }
  for (const z of [-14.35, 14.35]) {
    builder.addBox({ center: [0, 0.15, z], size: [36.3, 0.62, 0.42], material: "hazard" });
  }

  builder.addCylinder({ center: [0, 0.22, 0], radius: 5.45, height: 0.52, material: "darkPanel", segments: 20 });
  builder.addTorus({ center: [0, 0.58, 0], majorRadius: 4.75, tubeRadius: 0.28, material: "hazard", majorSegments: 24, minorSegments: 6 });
  builder.addCylinder({ center: [0, 0.51, 0], radius: 4.1, height: 0.42, material: "brushedSteel", segments: 20 });
  builder.addCylinder({ center: [0, 0.76, 0], radius: 2.65, height: 0.14, material: "darkPanel", segments: 16 });
  builder.addBox({ center: [0, 0.88, 0], size: [5.1, 0.09, 0.2], material: "cyanCircuit" });
  builder.addBox({ center: [0, 0.89, 0], size: [0.2, 0.1, 5.1], material: "cyanCircuit" });

  for (let pylon = 0; pylon < 4; pylon += 1) {
    const angle = pylon * Math.PI / 2 + Math.PI / 4;
    const x = Math.cos(angle) * 5.9;
    const z = Math.sin(angle) * 5.9;
    builder.addCylinder({ center: [x, 1.2, z], radius: 0.48, height: 2.3, material: "cleanSteel", segments: 10 });
    builder.addBox({ center: [x, 2.3, z], size: [0.62, 0.3, 0.62], material: "amberCircuit", rotation: [0, -angle, 0] });
  }

  builder.addBox({ center: [-11.8, 2.7, -8.7], size: [9.2, 5.4, 7.4], material: "blueHull" });
  builder.addBox({ center: [-11.8, 5.55, -8.7], size: [9.8, 0.36, 8], material: "darkPanel" });
  builder.addBox({ center: [-9.4, 2.05, -4.94], size: [3.35, 3.75, 0.22], material: "orangePaint" });
  builder.addBox({ center: [-14.5, 3.25, -4.93], size: [2.25, 1.05, 0.24], material: "cyanCircuit" });
  builder.addBox({ center: [-12, 0.45, -4.9], size: [8.2, 0.2, 0.42], material: "hazard" });
  for (let vent = 0; vent < 4; vent += 1) {
    builder.addBox({ center: [-15.55 + vent * 0.55, 4.65, -4.86], size: [0.27, 0.72, 0.28], material: "darkPanel" });
  }
  addPipe(builder, [-14.4, 6.15, -8.7], 0.32, 4.1, "x", "copper", 10);
  addPipe(builder, [-12.35, 5.1, -11.75], 0.25, 2.2, "y", "copper", 10);

  builder.addCylinder({ center: [11.2, 0.7, -7], radius: 1.6, height: 1.35, material: "safetyYellow", segments: 14 });
  builder.addBox({ center: [11.2, 5.2, -7], size: [1.35, 8.2, 1.35], material: "safetyYellow" });
  builder.addBox({ center: [6.5, 8.9, -7], size: [10.6, 0.72, 0.78], material: "safetyYellow", rotation: [0, 0, -0.05] });
  builder.addBox({ center: [11.35, 6.95, -6.2], size: [2.4, 1.65, 1.8], material: "orangePaint" });
  builder.addBox({ center: [10.88, 7.15, -5.25], size: [1.15, 0.62, 0.16], material: "cyanCircuit" });
  addPipe(builder, [1.8, 5.9, -7], 0.12, 5.7, "y", "darkPanel", 8);
  builder.addCylinder({ center: [1.8, 3.05, -7], radius: 0.34, height: 0.54, material: "amberCircuit", segments: 8 });

  const storage = [
    [10.3, 1.25, 8.7, "redPaint"], [14.1, 1.25, 8.7, "tealPaint"],
    [12.2, 3.72, 8.7, "orangePaint"], [15.6, 1.25, 4.9, "blueHull"],
  ];
  for (const [x, y, z, material] of storage) addContainer(builder, [x, y, z], [3.2, 2.4, 3], material);

  for (let panel = 0; panel < 4; panel += 1) {
    const x = -13.8 + panel * 3.2;
    builder.addBox({ center: [x, 2.15, 11.6], size: [2.85, 0.18, 4.5], material: "solarCell", rotation: [-0.38, 0, 0] });
    builder.addBox({ center: [x, 0.92, 12.05], size: [0.22, 2.1, 0.22], material: "cleanSteel", rotation: [-0.18, 0, 0] });
  }

  const scrap = [
    [-14.5, 0.6, 4.4, [2.5, 1, 1.1], [0.1, 0.6, 0.18], "copper"],
    [-12.7, 0.5, 5.2, [2.2, 0.8, 1.5], [-0.15, -0.35, 0.3], "darkPanel"],
    [-15.8, 0.45, 6.3, [1.8, 0.7, 2.1], [0.25, 0.2, -0.22], "brushedSteel"],
    [-13.8, 1.2, 6.1, [1.2, 2.1, 0.75], [0.5, 0.4, 0.18], "orangePaint"],
  ];
  for (const [x, y, z, size, rotation, material] of scrap) builder.addBox({ center: [x, y, z], size, rotation, material });
  builder.addTorus({ center: [-15.4, 0.72, 7.9], majorRadius: 0.85, tubeRadius: 0.24, material: "rubber", majorSegments: 12, minorSegments: 5, rotation: [Math.PI / 2, 0.18, 0] });

  for (const x of [-16.8, -8.4, 8.4, 16.8]) {
    builder.addBox({ center: [x, 1, 13.6], size: [0.24, 2.1, 0.24], material: "cleanSteel" });
    builder.addBox({ center: [x, 1, -13.6], size: [0.24, 2.1, 0.24], material: "cleanSteel" });
  }
  builder.addBox({ center: [0, 1.55, 13.6], size: [33.7, 0.18, 0.18], material: "cleanSteel" });
  builder.addBox({ center: [0, 1.55, -13.6], size: [33.7, 0.18, 0.18], material: "cleanSteel" });

  return {
    builder,
    basename: "repair-district",
    markers: [
      { name: "PlayerSpawn", translation: [-4.8, 0.86, 7.2], role: "spawn", extras: { entity: "service-rover", yawRadians: 2.55 } },
      { name: "DeliveryPad", translation: [0, 0.92, 0], role: "interaction", extras: { interaction: "repair-bay" } },
      { name: "RepairBay", translation: [0, 0.92, 0], role: "objective", extras: { radius: 4.1 } },
      { name: "CraneConsole", translation: [10.2, 0.55, -4.8], role: "interaction", extras: { interaction: "crane-console" } },
      { name: "DroneSpawn", translation: [6.8, 3.2, 5.6], role: "spawn", extras: { entity: "salvage-drone" } },
    ],
    gameplay: { walkableBounds: [-17.6, -13.6, 17.6, 13.6], repairBayRadius: 4.1 },
  };
}

function buildServiceRover() {
  const builder = new MeshBuilder("ServiceRoverGeometry");
  builder.addBox({ center: [0, 0.78, 0], size: [2.8, 0.62, 4.2], material: "orangePaint" });
  builder.addBox({ center: [0, 0.47, 0.25], size: [2.25, 0.28, 3.55], material: "darkPanel" });
  builder.addBox({ center: [0, 1.32, 0.65], size: [2.18, 0.72, 1.75], material: "ceramic", rotation: [-0.07, 0, 0] });
  builder.addBox({ center: [0, 1.46, 1.58], size: [1.82, 0.38, 0.18], material: "cyanCircuit", rotation: [-0.07, 0, 0] });
  builder.addBox({ center: [0, 1.05, 2.16], size: [2.35, 0.52, 0.22], material: "hazard" });

  for (const x of [-1.55, 1.55]) {
    for (const z of [-1.38, 1.38]) {
      builder.addCylinder({ center: [x, 0.58, z], radius: 0.67, height: 0.44, material: "rubber", segments: 12, rotation: [0, 0, Math.PI / 2] });
      builder.addCylinder({ center: [x * 1.006, 0.58, z], radius: 0.28, height: 0.48, material: "cleanSteel", segments: 10, rotation: [0, 0, Math.PI / 2] });
    }
  }

  builder.addCylinder({ center: [0, 1.32, -1.3], radius: 0.52, height: 0.38, material: "darkPanel", segments: 12 });
  builder.addBox({ center: [0, 2.05, -1.3], size: [0.42, 1.22, 0.42], material: "cleanSteel", rotation: [0.28, 0, 0] });
  builder.addBox({ center: [0, 2.66, -0.72], size: [0.36, 0.36, 1.28], material: "safetyYellow", rotation: [0.45, 0, 0] });
  builder.addCylinder({ center: [0, 2.86, -0.08], radius: 0.22, height: 0.5, material: "copper", segments: 10, rotation: [Math.PI / 2, 0, 0] });
  builder.addBox({ center: [-1.22, 1.2, -1.8], size: [0.18, 0.22, 0.62], material: "amberCircuit" });
  builder.addBox({ center: [1.22, 1.2, -1.8], size: [0.18, 0.22, 0.62], material: "amberCircuit" });
  builder.addBox({ center: [-1.3, 0.95, 1.78], size: [0.16, 0.18, 0.5], material: "cyanCircuit" });
  builder.addBox({ center: [1.3, 0.95, 1.78], size: [0.16, 0.18, 0.5], material: "cyanCircuit" });

  return {
    builder,
    basename: "service-rover",
    markers: [
      { name: "CameraFocus", translation: [0, 1.15, 0], role: "camera-target" },
      { name: "ToolTip", translation: [0, 2.88, 0.25], role: "interaction-origin", extras: { interaction: "repair-beam" } },
      { name: "GroundContact", translation: [0, 0, 0], role: "physics-origin" },
    ],
    gameplay: { footprint: [3.5, 4.6], forwardAxis: "+Z", nominalSpeed: 6.2 },
  };
}

function buildSalvageDrone() {
  const builder = new MeshBuilder("SalvageDroneGeometry");
  builder.addCylinder({ center: [0, 0, 0], radius: 1.08, height: 0.58, material: "tealPaint", segments: 14 });
  builder.addCylinder({ center: [0, 0.42, 0], radius: 0.72, topRadius: 0.28, height: 0.5, material: "ceramic", segments: 12 });
  builder.addCylinder({ center: [0, -0.46, 0], radius: 0.46, topRadius: 0.19, height: 0.36, material: "amberCircuit", segments: 10, rotation: [Math.PI, 0, 0] });
  builder.addBox({ center: [0, 0.05, 1.03], size: [0.78, 0.2, 0.18], material: "cyanCircuit" });

  for (let arm = 0; arm < 4; arm += 1) {
    const angle = arm * Math.PI / 2 + Math.PI / 4;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    builder.addBox({ center: [cos * 1.28, 0, sin * 1.28], size: [2.05, 0.2, 0.24], material: "cleanSteel", rotation: [0, -angle, 0] });
    const rotor = [cos * 2.15, 0.06, sin * 2.15];
    builder.addTorus({ center: rotor, majorRadius: 0.63, tubeRadius: 0.085, material: "darkPanel", majorSegments: 14, minorSegments: 4 });
    builder.addCylinder({ center: rotor, radius: 0.19, height: 0.3, material: "orangePaint", segments: 8 });
    builder.addBox({ center: [rotor[0], rotor[1] + 0.15, rotor[2]], size: [1.05, 0.035, 0.09], material: "brushedSteel", rotation: [0, -angle + 0.4, 0] });
  }

  return {
    builder,
    basename: "salvage-drone",
    markers: [
      { name: "CameraFocus", translation: [0, 0.1, 0], role: "camera-target" },
      { name: "CargoSocket", translation: [0, -0.72, 0], role: "attachment", extras: { accepts: "salvage-crate" } },
    ],
    gameplay: { radius: 2.9, hoverHeight: 3.2, forwardAxis: "+Z" },
  };
}

export async function generateAll(overrides = {}) {
  const options = { ...parseArguments([]), ...overrides };
  const textureProvenance = await generateTextures(options);
  const modelDirectory = path.join(options.outputRoot, "assets", "models");
  const models = [buildRepairDistrict(), buildServiceRover(), buildSalvageDrone()];
  const reports = [];
  for (const model of models) {
    const report = await writeGltf({
      ...model,
      outputDirectory: modelDirectory,
    });
    reports.push({ basename: model.basename, ...report.stats });
  }
  return { textureProvenance, models: reports };
}

function printHelp() {
  console.log(`AstraCraft ultra asset generator

Usage: node tools/generate-models.mjs [options]
  --output-root PATH          Write an ultra-compatible asset tree elsewhere
  --source-basecolor PNG      Replace the base atlas source non-destructively
  --overlay-basecolor PNG     Alpha-blend an ImageGen layer over the source
  --overlay-opacity 0..1      Overlay strength (default 0.72)
  --texture-size 64..4096     Derived PBR texture size (default 1024)`);
}

if (path.resolve(process.argv[1] ?? "") === path.resolve(SCRIPT_PATH)) {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) printHelp();
  else {
    const result = await generateAll(options);
    for (const model of result.models) {
      console.log(`${model.basename}: ${model.vertices} vertices, ${model.triangles} triangles, ${model.uvIslands} UV islands, ${model.materialPrimitives} materials`);
    }
    console.log(`Textures: ${result.textureProvenance.outputs.width}x${result.textureProvenance.outputs.height}, source SHA-256 ${result.textureProvenance.source.sha256.slice(0, 12)}…`);
  }
}

export { buildRepairDistrict, buildSalvageDrone, buildServiceRover, derivePbrMaps, makeFallbackAtlas, parseArguments };

