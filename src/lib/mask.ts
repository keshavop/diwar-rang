// Pure mask helpers. A mask is a Uint8Array (w*h), 0 = outside, 255 = inside.

export interface Point {
  x: number;
  y: number;
}

export type MaskMode = "add" | "subtract";

/** Merges `src` into `target` in place. */
export function combineMask(target: Uint8Array, src: Uint8Array, mode: MaskMode) {
  if (mode === "add") {
    for (let i = 0; i < target.length; i++) if (src[i] > target[i]) target[i] = src[i];
  } else {
    for (let i = 0; i < target.length; i++) {
      const keep = 255 - src[i];
      if (keep < target[i]) target[i] = keep;
    }
  }
}

/** Even-odd scanline rasterisation of a closed polygon (pixel centres). */
export function fillPolygon(w: number, h: number, pts: Point[]): Uint8Array {
  const out = new Uint8Array(w * h);
  if (pts.length < 3) return out;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(h - 1, Math.ceil(maxY));
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if ((a.y <= cy && b.y > cy) || (b.y <= cy && a.y > cy)) {
        xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x++) out[y * w + x] = 255;
    }
  }
  return out;
}

function stampCircle(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number, value: number) {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) mask[y * w + x] = value;
    }
  }
}

/** Paints (value=255) or erases (value=0) a round brush stroke from a to b, in place. */
export function stampLine(mask: Uint8Array, w: number, h: number, a: Point, b: Point, radius: number, value: number) {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const step = Math.max(1, radius / 3);
  const n = Math.max(1, Math.ceil(dist / step));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    stampCircle(mask, w, h, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, radius, value);
  }
}

/** 3×3 box blur → soft, anti-aliased edges for compositing. */
export function softenMask(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ya = y > 0 ? y - 1 : y;
    const yb = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const xa = x > 0 ? x - 1 : x;
      const xb = x < w - 1 ? x + 1 : x;
      const s =
        m[ya * w + xa] + m[ya * w + x] + m[ya * w + xb] +
        m[y * w + xa] + m[y * w + x] + m[y * w + xb] +
        m[yb * w + xa] + m[yb * w + x] + m[yb * w + xb];
      out[y * w + x] = (s / 9 + 0.5) | 0;
    }
  }
  return out;
}

/** 1 on pixels inside the mask that touch the outside. */
export function maskOutline(m: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m[i] < 128) continue;
      if (
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        m[i - 1] < 128 || m[i + 1] < 128 || m[i - w] < 128 || m[i + w] < 128
      ) {
        out[i] = 1;
      }
    }
  }
  return out;
}

export function maskArea(m: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < m.length; i++) if (m[i] >= 128) n++;
  return n;
}

export function isMaskEmpty(m: Uint8Array | undefined): boolean {
  if (!m) return true;
  for (let i = 0; i < m.length; i++) if (m[i]) return false;
  return true;
}
