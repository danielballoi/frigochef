// Genera le icone PNG della PWA senza dipendenze esterne: npm run icons
// Disegno: frigorifero bianco su fondo verde. Le icone "maskable" e Apple non hanno trasparenza.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/icons/', import.meta.url));
const GREEN = [47, 125, 79];
const DARK = [31, 90, 56];
const WHITE = [255, 255, 255];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Rettangolo arrotondato in coordinate normalizzate (0..1).
const inRoundRect = (x, y, l, t, r, b, radius) => {
  if (x < l || x > r || y < t || y > b) return false;
  const cx = Math.min(Math.max(x, l + radius), r - radius);
  const cy = Math.min(Math.max(y, t + radius), b - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};

/** Colore del punto (x, y) oppure null se trasparente. */
function shade(x, y, { fullBleed, scale }) {
  // Il disegno è più piccolo nelle icone maskable, per stare nella zona sicura.
  const u = 0.5 + (x - 0.5) / scale;
  const v = 0.5 + (y - 0.5) / scale;
  const background = fullBleed || inRoundRect(x, y, 0, 0, 1, 1, 0.22);
  if (!background) return null;
  if (inRoundRect(u, v, 0.3, 0.16, 0.7, 0.84, 0.06)) {
    if (v > 0.395 && v < 0.425) return DARK; // separazione tra freezer e frigo
    if (inRoundRect(u, v, 0.36, 0.24, 0.39, 0.35, 0.012)) return DARK; // maniglia alta
    if (inRoundRect(u, v, 0.36, 0.48, 0.39, 0.64, 0.012)) return DARK; // maniglia bassa
    return WHITE;
  }
  return GREEN;
}

function render(size, options) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const color = shade((px + (sx + 0.5) / samples) / size, (py + (sy + 0.5) / samples) / size, options);
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 1;
          }
        }
      }
      const i = (py * size + px) * 4;
      if (a > 0) {
        pixels[i] = Math.round(r / a);
        pixels[i + 1] = Math.round(g / a);
        pixels[i + 2] = Math.round(b / a);
      }
      pixels[i + 3] = Math.round((a / samples ** 2) * 255);
    }
  }
  return encodePng(size, pixels);
}

mkdirSync(OUT, { recursive: true });
const icons = [
  ['icon-192.png', 192, { fullBleed: false, scale: 1 }],
  ['icon-512.png', 512, { fullBleed: false, scale: 1 }],
  ['maskable-512.png', 512, { fullBleed: true, scale: 0.8 }],
  ['apple-touch-icon.png', 180, { fullBleed: true, scale: 0.9 }],
];
for (const [name, size, options] of icons) {
  writeFileSync(`${OUT}${name}`, render(size, options));
  console.log(`creata ${name} (${size}x${size})`);
}
