// Generates PWA icons (192x192 and 512x512) from the app's visual identity.
// Uses a minimal PNG encoder (no external deps) to create icons with the dark
// background (#1e1c1b) and a baby pink (#e8a0bf) snake/toolbox mark.
//
// The mark is a simple 8x8 pixel snake head drawn at the center, scaled up.
// This is honest placeholder art matching the app's color tokens.
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "public");

// Colors from the design tokens
const BG = [0x1e, 0x1c, 0x1b]; // --ground
const PINK = [0xe8, 0xa0, 0xbf]; // --pink
const MINT = [0x7b, 0xd8, 0x8f]; // --mint

// 8x8 snake/toolbox mark (1 = pink, 2 = mint, 0 = bg)
const MARK = [
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [1,1,2,1,1,2,1,1],
  [1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1],
  [0,1,1,0,0,1,1,0],
  [0,0,1,1,1,1,0,0],
  [0,0,0,1,1,0,0,0],
];

function colorFor(v) {
  if (v === 1) return PINK;
  if (v === 2) return MINT;
  return BG;
}

function createPNG(size) {
  const scale = Math.floor(size / 16); // mark is 8x8, centered in 16x16 logical grid
  const offsetX = Math.floor((size - 8 * scale) / 2);
  const offsetY = Math.floor((size - 8 * scale) / 2);

  // Create raw RGBA pixel data
  const raw = Buffer.alloc(size * (size * 4 + 1)); // +1 per row for filter byte
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const mx = Math.floor((x - offsetX) / scale);
      const my = Math.floor((y - offsetY) / scale);
      let color = BG;
      if (mx >= 0 && mx < 8 && my >= 0 && my < 8) {
        color = colorFor(MARK[my][mx]);
      }
      const off = rowStart + 1 + x * 4;
      raw[off] = color[0];
      raw[off + 1] = color[1];
      raw[off + 2] = color[2];
      raw[off + 3] = 255; // alpha
    }
  }

  // Minimal PNG encoder
  const compressed = deflateSync(raw);

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let j = 0; j < 8; j++) {
        c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeAndData = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData));
    return Buffer.concat([len, typeAndData, crc]);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });

for (const size of [192, 512]) {
  const png = createPNG(size);
  const path = join(OUT, `icon-${size}.png`);
  writeFileSync(path, png);
  console.log(`Generated ${path} (${png.length} bytes, ${size}x${size})`);
}
