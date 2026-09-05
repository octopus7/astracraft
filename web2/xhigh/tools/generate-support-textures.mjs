import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolDir = dirname(fileURLToPath(import.meta.url));
const textureDir = join(toolDir, '..', 'assets', 'textures');
const baseColorPath = join(textureDir, 'material-atlas-basecolor.png');
const normalPath = join(textureDir, 'material-atlas-normal.png');
const ormPath = join(textureDir, 'material-atlas-orm.png');
const baseColor = readFileSync(baseColorPath);

if (baseColor.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('Base-color atlas is not a PNG file.');
const width = baseColor.readUInt32BE(16);
const height = baseColor.readUInt32BE(20);
if (width < 512 || height < 512) throw new Error(`Base-color atlas is too small (${width}x${height}).`);

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length, 0);
  typeBuffer.copy(output, 4);
  data.copy(output, 8);
  output.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), output.length - 4);
  return output;
}

function createPng(pixelAt) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    scanlines[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = pixelAt(x, y);
      const offset = row + 1 + x * 4;
      scanlines[offset] = pixel[0];
      scanlines[offset + 1] = pixel[1];
      scanlines[offset + 2] = pixel[2];
      scanlines[offset + 3] = pixel[3] ?? 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function quadrant(x, y) {
  const right = x >= width / 2;
  const bottom = y >= height / 2;
  if (!right && !bottom) return 'charcoal';
  if (right && !bottom) return 'rust';
  if (!right && bottom) return 'stone';
  return 'teal';
}

const surface = {
  charcoal: { roughness: 194, metallic: 224 },
  rust: { roughness: 208, metallic: 164 },
  stone: { roughness: 236, metallic: 4 },
  teal: { roughness: 181, metallic: 210 },
};

writeFileSync(normalPath, createPng(() => [128, 128, 255, 255]));
writeFileSync(ormPath, createPng((x, y) => {
  const values = surface[quadrant(x, y)];
  const variation = ((x * 17 + y * 31 + ((x * y) % 19)) % 13) - 6;
  return [238, Math.max(0, Math.min(255, values.roughness + variation)), values.metallic, 255];
}));

console.log(`Generated ${width}x${height} flat-normal and packed ORM textures.`);
