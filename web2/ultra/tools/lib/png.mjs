import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let value = n;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  crcTable[n] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.allocUnsafe(data.length + 12);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return chunk;
}

export function encodeRgbaPng(width, height, pixels) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error("PNG dimensions must be positive integers.");
  }
  if (pixels.length !== width * height * 4) {
    throw new Error(`Expected ${width * height * 4} RGBA bytes, received ${pixels.length}.`);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.allocUnsafe((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    Buffer.from(pixels.buffer, pixels.byteOffset + y * stride, stride).copy(raw, rowOffset + 1);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

export function decodePng(buffer) {
  if (!Buffer.from(buffer.subarray(0, 8)).equals(PNG_SIGNATURE)) {
    throw new Error("Input is not a PNG file.");
  }

  let offset = 8;
  let width;
  let height;
  let bitDepth;
  let colorType;
  let interlace;
  let palette;
  let transparency;
  const idat = [];

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error(`Truncated PNG chunk ${type}.`);
    const data = buffer.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[10] !== 0 || data[11] !== 0) throw new Error("Unsupported PNG compression or filter method.");
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = Buffer.from(data);
    } else if (type === "tRNS") {
      transparency = Buffer.from(data);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || bitDepth !== 8 || interlace !== 0) {
    throw new Error("Only non-interlaced 8-bit PNG inputs are supported.");
  }

  const channelCounts = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]);
  const channels = channelCounts.get(colorType);
  if (!channels) throw new Error(`Unsupported PNG color type ${colorType}.`);
  if (colorType === 3 && !palette) throw new Error("Indexed PNG is missing its palette.");

  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(idat));
  if (inflated.length !== (stride + 1) * height) {
    throw new Error("PNG scanline data has an unexpected size.");
  }

  const decoded = Buffer.allocUnsafe(stride * height);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = y * (stride + 1);
    const filter = inflated[sourceOffset];
    for (let x = 0; x < stride; x += 1) {
      const value = inflated[sourceOffset + 1 + x];
      const left = x >= channels ? decoded[y * stride + x - channels] : 0;
      const above = y > 0 ? decoded[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= channels ? decoded[(y - 1) * stride + x - channels] : 0;
      let reconstructed;
      if (filter === 0) reconstructed = value;
      else if (filter === 1) reconstructed = (value + left) & 0xff;
      else if (filter === 2) reconstructed = (value + above) & 0xff;
      else if (filter === 3) reconstructed = (value + Math.floor((left + above) / 2)) & 0xff;
      else if (filter === 4) reconstructed = (value + paethPredictor(left, above, upperLeft)) & 0xff;
      else throw new Error(`Unsupported PNG scanline filter ${filter}.`);
      decoded[y * stride + x] = reconstructed;
    }
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    if (colorType === 6) {
      pixels[target] = decoded[source];
      pixels[target + 1] = decoded[source + 1];
      pixels[target + 2] = decoded[source + 2];
      pixels[target + 3] = decoded[source + 3];
    } else if (colorType === 2) {
      pixels[target] = decoded[source];
      pixels[target + 1] = decoded[source + 1];
      pixels[target + 2] = decoded[source + 2];
      pixels[target + 3] = 255;
    } else if (colorType === 3) {
      const paletteIndex = decoded[source];
      pixels[target] = palette[paletteIndex * 3] ?? 0;
      pixels[target + 1] = palette[paletteIndex * 3 + 1] ?? 0;
      pixels[target + 2] = palette[paletteIndex * 3 + 2] ?? 0;
      pixels[target + 3] = transparency?.[paletteIndex] ?? 255;
    } else {
      const gray = decoded[source];
      pixels[target] = gray;
      pixels[target + 1] = gray;
      pixels[target + 2] = gray;
      pixels[target + 3] = colorType === 4 ? decoded[source + 1] : 255;
    }
  }

  return { width, height, pixels };
}

export function resizeRgbaNearest(image, width, height) {
  if (image.width === width && image.height === height) {
    return { width, height, pixels: new Uint8Array(image.pixels) };
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width));
      const source = (sourceY * image.width + sourceX) * 4;
      const target = (y * width + x) * 4;
      pixels[target] = image.pixels[source];
      pixels[target + 1] = image.pixels[source + 1];
      pixels[target + 2] = image.pixels[source + 2];
      pixels[target + 3] = image.pixels[source + 3];
    }
  }
  return { width, height, pixels };
}

export function resizeRgbaBilinear(image, width, height) {
  if (image.width === width && image.height === height) {
    return { width, height, pixels: new Uint8Array(image.pixels) };
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = ((y + 0.5) * image.height) / height - 0.5;
    const y0 = Math.max(0, Math.floor(sourceY));
    const y1 = Math.min(image.height - 1, y0 + 1);
    const fy = Math.max(0, sourceY - y0);
    for (let x = 0; x < width; x += 1) {
      const sourceX = ((x + 0.5) * image.width) / width - 0.5;
      const x0 = Math.max(0, Math.floor(sourceX));
      const x1 = Math.min(image.width - 1, x0 + 1);
      const fx = Math.max(0, sourceX - x0);
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const top = image.pixels[(y0 * image.width + x0) * 4 + channel] * (1 - fx)
          + image.pixels[(y0 * image.width + x1) * 4 + channel] * fx;
        const bottom = image.pixels[(y1 * image.width + x0) * 4 + channel] * (1 - fx)
          + image.pixels[(y1 * image.width + x1) * 4 + channel] * fx;
        pixels[target + channel] = Math.round(top * (1 - fy) + bottom * fy);
      }
    }
  }
  return { width, height, pixels };
}
