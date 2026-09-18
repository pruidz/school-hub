/*
 * Generates every launcher asset the app ships: PWA icons, the maskable
 * variants, the iOS touch icon, the iOS launch screens and the vector source.
 *
 *   node scripts/generate-icons.mjs
 *
 * No dependencies and no network. Shapes are signed distance fields sampled
 * with 2x2 supersampling, so the edges are analytically anti-aliased at every
 * size, and the PNGs are written by the small encoder at the bottom of this
 * file (zlib is in the standard library).
 *
 * The mark is the Georgian letter "ს" (san) — the first letter of "სკოლა",
 * school — redrawn as a single round-capped stroke: a tall stem, a full bowl
 * and a short riser ending in a hook. One letter stays readable at 48px in a
 * way that a scene or a tool icon does not.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");

/* -------------------------------------------------------------------------- */
/*  brand                                                                     */
/* -------------------------------------------------------------------------- */

/** Tile gradient, top to bottom. The mid-tone is what a 48px icon reads as. */
const TILE_TOP = [0x5b, 0x51, 0xea];
const TILE_BOTTOM = [0x3f, 0x35, 0xc4];
/** The letter. Pure white keeps the contrast ratio above 7:1 on both stops. */
const INK = [0xff, 0xff, 0xff];

/** App surfaces, kept in step with `--background` in `globals.css`. */
const SURFACE_LIGHT = [0xff, 0xff, 0xff];
const SURFACE_DARK = [0x0a, 0x0a, 0x0a];

/** Corner radius of the standalone tile, as a fraction of its width. */
const TILE_RADIUS = 0.22;

/* -------------------------------------------------------------------------- */
/*  the letter, in a 0..100 box with y pointing down                          */
/* -------------------------------------------------------------------------- */

const STROKE = 12;

/**
 * `seg` is a line, `arc` is a circular sweep covering the angles `a0..a1`
 * measured in degrees with y pointing down (0 = right, 90 = bottom).
 *
 * The proportions were taken off a rendered grotesque: stem and riser 0.57
 * apart in a box 1.0 tall, a deep semicircular bowl joining them, and a very
 * tight hook — barely wider than the stroke — at the top of the riser. The
 * wide gap between that hook and the stem is what keeps the letter a "ს" and
 * not a Latin "b". The stroke is a little heavier than text weight so the
 * counter still holds together at 48px.
 */
const GLYPH = [
  { kind: "seg", x0: 6, y0: 6, x1: 6, y1: 71.3 }, // stem
  { kind: "arc", cx: 28.7, cy: 71.3, r: 22.7, a0: 0, a1: 180 }, // bowl
  { kind: "seg", x0: 51.4, y0: 71.3, x1: 51.4, y1: 44 }, // riser
  { kind: "arc", cx: 46.4, cy: 44, r: 5, a0: 180, a1: 360 }, // hook
];

const HALF = STROKE / 2;

function distanceToSegment(px, py, s) {
  const dx = s.x1 - s.x0;
  const dy = s.y1 - s.y0;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / lengthSquared),
        );
  return Math.hypot(px - (s.x0 + t * dx), py - (s.y0 + t * dy));
}

function distanceToArc(px, py, a) {
  const dx = px - a.cx;
  const dy = py - a.cy;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle < 0) angle += 360;

  const within =
    (angle >= a.a0 && angle <= a.a1) ||
    (angle + 360 >= a.a0 && angle + 360 <= a.a1);

  if (within) return Math.abs(Math.hypot(dx, dy) - a.r);

  // Outside the sweep: the nearest point is one of the two end caps.
  const end = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return Math.hypot(
      px - (a.cx + a.r * Math.cos(rad)),
      py - (a.cy + a.r * Math.sin(rad)),
    );
  };
  return Math.min(end(a.a0), end(a.a1));
}

/** Signed distance to the stroked letter, in glyph units. */
function glyphDistance(px, py) {
  let best = Infinity;
  for (const part of GLYPH) {
    const d =
      part.kind === "seg"
        ? distanceToSegment(px, py, part)
        : distanceToArc(px, py, part);
    if (d < best) best = d;
  }
  return best - HALF;
}

/** Tight bounds of the stroked letter, so it can be centred optically. */
const GLYPH_BOX = (() => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const grow = (x, y) => {
    minX = Math.min(minX, x - HALF);
    minY = Math.min(minY, y - HALF);
    maxX = Math.max(maxX, x + HALF);
    maxY = Math.max(maxY, y + HALF);
  };

  for (const part of GLYPH) {
    if (part.kind === "seg") {
      grow(part.x0, part.y0);
      grow(part.x1, part.y1);
      continue;
    }
    for (let a = part.a0; a <= part.a1; a += 1) {
      const rad = (a * Math.PI) / 180;
      grow(part.cx + part.r * Math.cos(rad), part.cy + part.r * Math.sin(rad));
    }
  }

  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
})();

/* -------------------------------------------------------------------------- */
/*  shape helpers                                                             */
/* -------------------------------------------------------------------------- */

/** Signed distance to a rounded box centred on (cx, cy), in pixels. */
function roundedBoxDistance(px, py, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  return (
    Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
    Math.min(Math.max(qx, qy), 0) -
    radius
  );
}

/** Analytic coverage of a distance field at one sample point. */
function coverage(distance) {
  return Math.max(0, Math.min(1, 0.5 - distance));
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/* -------------------------------------------------------------------------- */
/*  the tile                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Paints the mark into an RGBA buffer.
 *
 *  - `radius`  corner radius in pixels; 0 draws a full-bleed square.
 *  - `inset`   distance from the tile edge to the image edge, in pixels.
 *  - `glyph`   height of the letter as a fraction of the tile's height.
 */
function paintTile(pixels, width, height, options) {
  const {
    left = 0,
    top = 0,
    size,
    radius,
    glyphScale,
    tileTop = TILE_TOP,
    tileBottom = TILE_BOTTOM,
  } = options;

  const cx = left + size / 2;
  const cy = top + size / 2;
  const half = size / 2;

  // Fit the letter's bounding box into `glyphScale` of the tile height and
  // centre it on the tile's optical centre.
  const scale = (size * glyphScale) / GLYPH_BOX.height;
  const glyphW = GLYPH_BOX.width * scale;
  const glyphH = GLYPH_BOX.height * scale;
  const originX = cx - glyphW / 2 - GLYPH_BOX.minX * scale;
  const originY = cy - glyphH / 2 - GLYPH_BOX.minY * scale;

  const x0 = Math.max(0, Math.floor(left));
  const y0 = Math.max(0, Math.floor(top));
  const x1 = Math.min(width, Math.ceil(left + size));
  const y1 = Math.min(height, Math.ceil(top + size));

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      let tileA = 0;
      let inkA = 0;

      // 2x2 supersampling on top of the analytic coverage: enough to keep the
      // hook's inner curve clean at 48px without a visible cost at 1024px.
      for (let sy = 0; sy < 2; sy += 1) {
        for (let sx = 0; sx < 2; sx += 1) {
          const px = x + 0.25 + sx * 0.5;
          const py = y + 0.25 + sy * 0.5;

          tileA +=
            coverage(roundedBoxDistance(px, py, cx, cy, half, half, radius)) /
            4;

          const gx = (px - originX) / scale;
          const gy = (py - originY) / scale;
          inkA += coverage(glyphDistance(gx, gy) * scale) / 4;
        }
      }

      if (tileA <= 0) continue;

      const gradient = mix(tileTop, tileBottom, (y - top) / size);
      const source = mix(gradient, INK, Math.min(inkA, 1));

      // Source-over onto whatever is already there: transparency for the PWA
      // icons, the surface colour for the launch screens.
      const offset = (y * width + x) * 4;
      const destinationA = pixels[offset + 3] / 255;
      const outA = tileA + destinationA * (1 - tileA);

      for (let c = 0; c < 3; c += 1) {
        const blended =
          (source[c] * tileA + pixels[offset + c] * destinationA * (1 - tileA)) /
          outA;
        pixels[offset + c] = Math.round(blended);
      }
      pixels[offset + 3] = Math.round(outA * 255);
    }
  }
}

function fill(pixels, rgb) {
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = rgb[0];
    pixels[i + 1] = rgb[1];
    pixels[i + 2] = rgb[2];
    pixels[i + 3] = 255;
  }
}

/* -------------------------------------------------------------------------- */
/*  outputs                                                                   */
/* -------------------------------------------------------------------------- */

function write(path, buffer) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, buffer);
  console.log(
    `  ${path.slice(ROOT.length + 1).replace(/\\/g, "/")}  ${(
      buffer.length / 1024
    ).toFixed(1)} KB`,
  );
}

/** A rounded tile on transparency: manifest `purpose: "any"`. */
function anyIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  paintTile(pixels, size, size, {
    size,
    radius: size * TILE_RADIUS,
    glyphScale: 0.56,
  });
  return encodePng(size, size, pixels, true);
}

/**
 * Full-bleed square: manifest `purpose: "maskable"`. Android may crop
 * anything outside the centred circle of 80% diameter, so the letter is kept
 * inside a 40% radius — hence the smaller glyph scale.
 */
function maskableIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  paintTile(pixels, size, size, { size, radius: 0, glyphScale: 0.46 });
  return encodePng(size, size, pixels, true);
}

/**
 * iOS applies its own mask, so this is a square with square corners — and it
 * is written without an alpha channel, because iOS composites transparency
 * against black and any stray alpha shows up as a dark fringe.
 */
function appleTouchIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  paintTile(pixels, size, size, { size, radius: 0, glyphScale: 0.46 });
  return encodePng(size, size, pixels, false);
}

/**
 * An iOS launch screen. Matched by exact pixel size, so each device family
 * needs its own file; the artwork is the tile on the app's own surface colour,
 * which is what stops the dark-mode launch flashing white.
 */
function splash(width, height, dark) {
  const pixels = new Uint8Array(width * height * 4);
  fill(pixels, dark ? SURFACE_DARK : SURFACE_LIGHT);

  const size = Math.round(Math.min(width, height) * 0.28);
  paintTile(pixels, width, height, {
    left: Math.round((width - size) / 2),
    top: Math.round((height - size) / 2),
    size,
    radius: size * TILE_RADIUS,
    glyphScale: 0.56,
  });

  return encodePng(width, height, pixels, false);
}

/** The same geometry as a vector, for `icon.svg` and any future print use. */
function markSvg() {
  const S = 192;
  const scale = (S * 0.56) / GLYPH_BOX.height;
  const originX = S / 2 - (GLYPH_BOX.width * scale) / 2 - GLYPH_BOX.minX * scale;
  const originY =
    S / 2 - (GLYPH_BOX.height * scale) / 2 - GLYPH_BOX.minY * scale;

  const point = (x, y) =>
    `${(originX + x * scale).toFixed(2)} ${(originY + y * scale).toFixed(2)}`;

  const bowl = GLYPH[1];
  const hook = GLYPH[3];
  const hookEnd = {
    x: hook.cx + hook.r * Math.cos((hook.a0 * Math.PI) / 180),
    y: hook.cy + hook.r * Math.sin((hook.a0 * Math.PI) / 180),
  };

  const path = [
    `M ${point(GLYPH[0].x0, GLYPH[0].y0)}`,
    `L ${point(GLYPH[0].x1, GLYPH[0].y1)}`,
    `A ${(bowl.r * scale).toFixed(2)} ${(bowl.r * scale).toFixed(2)} 0 0 0 ${point(
      GLYPH[2].x0,
      GLYPH[2].y0,
    )}`,
    `L ${point(GLYPH[2].x1, GLYPH[2].y1)}`,
    `A ${(hook.r * scale).toFixed(2)} ${(hook.r * scale).toFixed(2)} 0 0 0 ${point(
      hookEnd.x,
      hookEnd.y,
    )}`,
  ].join(" ");

  const hex = (rgb) =>
    `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="SCHOOL-HUB">
  <defs>
    <linearGradient id="tile" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hex(TILE_TOP)}" />
      <stop offset="1" stop-color="${hex(TILE_BOTTOM)}" />
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" rx="${(S * TILE_RADIUS).toFixed(
    1,
  )}" ry="${(S * TILE_RADIUS).toFixed(1)}" fill="url(#tile)" />
  <path
    d="${path}"
    fill="none"
    stroke="${hex(INK)}"
    stroke-width="${(STROKE * scale).toFixed(2)}"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
`;
}

/**
 * Portrait launch-screen sizes, in device pixels. iOS matches these exactly:
 * a size that is not listed simply falls back to the manifest background.
 * Covers iPhone SE (2nd/3rd gen) through the iPhone 16 family.
 */
const SPLASH_SIZES = [
  [750, 1334], // SE 2/3, 8
  [828, 1792], // XR, 11
  [1125, 2436], // X, XS, 11 Pro
  [1170, 2532], // 12, 12 Pro, 13, 13 Pro, 14
  [1179, 2556], // 14 Pro, 15, 15 Pro, 16
  [1206, 2622], // 16 Pro
  [1242, 2688], // XS Max, 11 Pro Max
  [1284, 2778], // 12 Pro Max, 13 Pro Max, 14 Plus
  [1290, 2796], // 14 Pro Max, 15 Pro Max, 16 Plus
  [1320, 2868], // 16 Pro Max
];

function main() {
  console.log("icons");
  write(join(PUBLIC, "icons", "icon-192.png"), anyIcon(192));
  write(join(PUBLIC, "icons", "icon-512.png"), anyIcon(512));
  write(join(PUBLIC, "icons", "icon-maskable-192.png"), maskableIcon(192));
  write(join(PUBLIC, "icons", "icon-maskable-512.png"), maskableIcon(512));
  write(join(PUBLIC, "icons", "icon.svg"), Buffer.from(markSvg(), "utf8"));
  write(join(PUBLIC, "apple-touch-icon.png"), appleTouchIcon(180));

  console.log("launch screens");
  for (const [width, height] of SPLASH_SIZES) {
    write(
      join(PUBLIC, "icons", "splash", `light-${width}x${height}.png`),
      splash(width, height, false),
    );
    write(
      join(PUBLIC, "icons", "splash", `dark-${width}x${height}.png`),
      splash(width, height, true),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*  PNG encoder                                                               */
/* -------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Per-row filter choice, using libpng's minimum-sum-of-absolute-differences. */
function filterRow(row, previous, bpp) {
  const candidates = [];

  const none = Buffer.concat([Buffer.from([0]), row]);
  candidates.push(none);

  const sub = Buffer.alloc(row.length + 1);
  sub[0] = 1;
  for (let i = 0; i < row.length; i += 1) {
    sub[i + 1] = (row[i] - (i >= bpp ? row[i - bpp] : 0)) & 0xff;
  }
  candidates.push(sub);

  const up = Buffer.alloc(row.length + 1);
  up[0] = 2;
  for (let i = 0; i < row.length; i += 1) {
    up[i + 1] = (row[i] - previous[i]) & 0xff;
  }
  candidates.push(up);

  let best = candidates[0];
  let bestScore = Infinity;
  for (const candidate of candidates) {
    let score = 0;
    for (let i = 1; i < candidate.length; i += 1) {
      score += candidate[i] < 128 ? candidate[i] : 256 - candidate[i];
    }
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Minimal PNG writer: 8-bit RGB (`alpha: false`) or RGBA (`alpha: true`). */
function encodePng(width, height, rgba, alpha) {
  const bpp = alpha ? 4 : 3;
  const stride = width * bpp;

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = alpha ? 6 : 2; // colour type
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const rows = [];
  let previous = Buffer.alloc(stride);

  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < width; x += 1) {
      const from = (y * width + x) * 4;
      const to = x * bpp;
      row[to] = rgba[from];
      row[to + 1] = rgba[from + 1];
      row[to + 2] = rgba[from + 2];
      if (alpha) row[to + 3] = rgba[from + 3];
    }
    rows.push(filterRow(row, previous, bpp));
    previous = row;
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

main();
