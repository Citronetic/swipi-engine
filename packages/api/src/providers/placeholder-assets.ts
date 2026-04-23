/**
 * PlaceholderAssetProvider — generates minimal 1x1 PNG stubs so Phase 3
 * runs are testable without a real image-generation key. Swap for a real
 * provider (OpenAI DALL-E, Stability, Replicate, fal.ai, DashScope) in
 * production.
 *
 * Each request writes a uniquely-colored 1x1 PNG derived from a hash of
 * the asset key — enough to satisfy Phaser's texture loader. Audio and
 * animation strips are stubbed as zero-byte files.
 */

import { writeFile } from 'node:fs/promises';
import type {
  AssetProvider,
  ImageGenerationInput,
  AudioGenerationInput,
} from '@swipi/core';

// Hardcoded 1x1 PNG template. We patch the IDAT's pixel bytes per key.
// The 33-byte prefix + IHDR + palette-free IDAT yields a fully valid PNG.
// Reference: https://www.w3.org/TR/PNG/
function makeOnePxPng(r: number, g: number, b: number): Buffer {
  // Minimal 1x1 RGB PNG (no alpha, no gamma). We compute CRCs on the fly.
  const crcTable = buildCrcTable();
  const chunk = (type: string, data: Buffer): Buffer => {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data]), crcTable), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  };

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); // width
  ihdr.writeUInt32BE(1, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Uncompressed IDAT: filter byte (0) + one RGB pixel.
  const raw = Buffer.from([0x00, r, g, b]);
  const idatData = deflate(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Pure-JS zlib deflate via Node's zlib. */
function deflate(data: Buffer): Buffer {
  // Use node:zlib synchronously to avoid pulling async into the PNG builder.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zlib = require('node:zlib') as typeof import('node:zlib');
  return zlib.deflateSync(data);
}

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
}

function crc32(buf: Buffer, table: Uint32Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (table[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8));
  return (c ^ 0xffffffff) >>> 0;
}

function colorFromKey(key: string): [number, number, number] {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return [(h >> 16) & 0xff, (h >> 8) & 0xff, h & 0xff];
}

export class PlaceholderAssetProvider implements AssetProvider {
  async generateImage(
    _input: ImageGenerationInput,
    outputPath: string,
  ): Promise<{ url: string }> {
    // Derive a stable color from the output filename so each asset is
    // distinguishable when debugging generated games visually.
    const key = outputPath.split('/').pop() ?? outputPath;
    const [r, g, b] = colorFromKey(key);
    const png = makeOnePxPng(r, g, b);
    await writeFile(outputPath, png);
    return { url: outputPath };
  }

  async generateAudio(
    _input: AudioGenerationInput,
    outputPath: string,
  ): Promise<{ url: string }> {
    // Minimal silent WAV header (44 bytes) + 0 samples.
    const wav = Buffer.from([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
      0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
    ]);
    await writeFile(outputPath, wav);
    return { url: outputPath };
  }
}
