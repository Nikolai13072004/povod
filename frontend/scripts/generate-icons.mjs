/**
 * Генератор иконок приложения (PWA-001).
 *
 * Иконки собираются из описания фигур, а не лежат в репозитории бинарником
 * неясного происхождения: цвет берётся из токенов оформления, а размеры и
 * варианты можно пересобрать одной командой (`npm run icons`).
 *
 * Зависимостей нет намеренно — PNG пишется вручную поверх `node:zlib`.
 *
 * Знак: белое облачко реплики с искрой внутри на фирменном синем — тот же
 * мотив, что и в логотипе `src/assets/images/logo.png`, только в инверсии,
 * потому что на иконке приложения фон должен быть заливкой, а не белым полем.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

/** Фирменный синий из `src/styles/tokens.css` (--povod-primary). */
const BRAND = [0x21, 0x70, 0xc6];
const WHITE = [0xff, 0xff, 0xff];

/** Холст знака: все координаты ниже заданы в этой системе. */
const CANVAS = 512;

// --- геометрия ---------------------------------------------------------------

function insideRoundedRect(x, y, { left, top, width, height, radius }) {
  const right = left + width;
  const bottom = top + height;
  if (x < left || x > right || y < top || y > bottom) return false;

  // Углы: точка вне скругления, только если вышла за четверть окружности.
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  if (cx === x || cy === y) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function quadraticPoints(from, control, to, steps) {
  const points = [];
  for (let i = 0; i < steps; i += 1) {
    const t = i / steps;
    const inv = 1 - t;
    points.push([
      inv * inv * from[0] + 2 * inv * t * control[0] + t * t * to[0],
      inv * inv * from[1] + 2 * inv * t * control[1] + t * t * to[1],
    ]);
  }
  return points;
}

/**
 * Искра — четырёхлучевая звезда с вогнутыми сторонами.
 * Стороны строятся квадратичными кривыми с контрольной точкой у центра:
 * чем она ближе, тем острее лучи.
 */
function sparklePolygon(cx, cy, radiusY, radiusX) {
  const north = [cx, cy - radiusY];
  const east = [cx + radiusX, cy];
  const south = [cx, cy + radiusY];
  const west = [cx - radiusX, cy];
  const pull = 0.16;
  const bend = (a, b) => [
    cx + (a[0] - cx) * pull + (b[0] - cx) * pull,
    cy + (a[1] - cy) * pull + (b[1] - cy) * pull,
  ];
  return [
    ...quadraticPoints(north, bend(north, east), east, 20),
    ...quadraticPoints(east, bend(east, south), south, 20),
    ...quadraticPoints(south, bend(south, west), west, 20),
    ...quadraticPoints(west, bend(west, north), north, 20),
  ];
}

const BUBBLE = { left: 104, top: 112, width: 304, height: 232, radius: 64 };
const BUBBLE_TAIL = [
  [172, 320],
  [158, 430],
  [256, 320],
];
const SPARKLE = sparklePolygon(256, 228, 84, 64);
const SPARKLE_SMALL = sparklePolygon(346, 168, 30, 23);

/**
 * Цвет точки знака.
 *
 * `bleed` = знак на сплошной заливке во весь квадрат. Так нужно для maskable и
 * для iOS: там систему не устраивают наши скруглённые углы, она обрезает икону
 * своей формой, и прозрачные углы превращаются в чёрные.
 */
function paint(x, y, { bleed }) {
  const background = bleed
    ? true
    : insideRoundedRect(x, y, { left: 0, top: 0, width: CANVAS, height: CANVAS, radius: 114 });
  if (!background) return null;

  const inBubble = insideRoundedRect(x, y, BUBBLE) || insidePolygon(x, y, BUBBLE_TAIL);
  if (!inBubble) return BRAND;

  const inSparkle = insidePolygon(x, y, SPARKLE) || insidePolygon(x, y, SPARKLE_SMALL);
  return inSparkle ? BRAND : WHITE;
}

// --- растеризация ------------------------------------------------------------

/**
 * Сглаживание — усреднением подвыборок: фигуры заданы аналитически, поэтому
 * достаточно посчитать цвет в SAMPLES×SAMPLES точках внутри пикселя.
 */
const SAMPLES = 4;

function rasterize(size, { bleed, scale }) {
  const pixels = Buffer.alloc(size * size * 4);
  const unit = CANVAS / size;
  const center = CANVAS / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const px = (x + (sx + 0.5) / SAMPLES) * unit;
          const py = (y + (sy + 0.5) / SAMPLES) * unit;
          // Масштабирование знака относительно центра холста: для maskable
          // содержимое должно уместиться в безопасную зону (внутренние 80%).
          const color = paint(center + (px - center) / scale, center + (py - center) / scale, {
            bleed,
          });
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 255;
          }
        }
      }
      const total = SAMPLES * SAMPLES;
      const covered = a / 255;
      const offset = (y * size + x) * 4;
      // Цвет усредняется только по покрытым подвыборкам, иначе на краю
      // проступает тёмная кайма от прозрачных (нулевых) точек.
      pixels[offset] = covered ? Math.round(r / covered) : 0;
      pixels[offset + 1] = covered ? Math.round(g / covered) : 0;
      pixels[offset + 2] = covered ? Math.round(b / covered) : 0;
      pixels[offset + 3] = Math.round(a / total);
    }
  }
  return pixels;
}

// --- запись PNG --------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 4;
  // Каждой строке PNG предшествует байт фильтра; 0 — «без фильтра».
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // бит на канал
  header[9] = 6; // цветовой тип: RGBA
  header[10] = 0; // сжатие deflate
  header[11] = 0; // фильтрация по умолчанию
  header[12] = 0; // без чересстрочности

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- сборка ------------------------------------------------------------------

const TARGETS = [
  { file: "icon-192.png", size: 192, bleed: false, scale: 1 },
  { file: "icon-512.png", size: 512, bleed: false, scale: 1 },
  // maskable: система обрезает иконку произвольной формой (круг, каплю,
  // суперэллипс), гарантированно видны лишь внутренние 80%.
  { file: "icon-maskable-512.png", size: 512, bleed: true, scale: 0.72 },
  { file: "apple-touch-icon.png", size: 180, bleed: true, scale: 1 },
];

mkdirSync(OUTPUT_DIR, { recursive: true });
for (const target of TARGETS) {
  const pixels = rasterize(target.size, target);
  const png = encodePng(target.size, pixels);
  writeFileSync(join(OUTPUT_DIR, target.file), png);
  process.stdout.write(`${target.file} — ${target.size}×${target.size}, ${png.length} Б\n`);
}
