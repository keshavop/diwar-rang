// Tap-to-select: colour-similarity flood fill over a Lab image.

export interface FillOptions {
  /** Max colour distance from the seed colour (roughly ΔE, 0–100). */
  tolerance: number;
  /** Only pixels connected to the seed (true) or every matching pixel (false). */
  contiguous: boolean;
  /** Optional edge barrier (1 = edge). Fill never crosses these pixels. */
  edges?: Uint8Array | null;
  /** Close small holes in the result (radius in px, 0 = off). */
  closeRadius?: number;
  /** Precomputed `textureMap` for this image (computed on the fly if omitted). */
  texture?: Float32Array;
  /** Advanced: tuning knobs, mostly multipliers of `tolerance`. */
  tuning?: Partial<FillTuning>;
}

export interface FillTuning {
  /** Always accept pixels this close (plain ΔE) to the seed (× tolerance). */
  strong: number;
  /** Max colour change across `baseline` px for a shade-aware match (× tolerance). */
  jump: number;
  /** Pixels back along the fill direction to compare against. */
  baseline: number;
  /** Lightness weight for colourful seeds (neutral seeds always use 1). */
  shadeWeight: number;
  /**
   * Pixels busier than this (local ΔE, see `textureMap`) are treated as
   * foliage/grilles/edges: they may join at the border but never spread the fill.
   * Scaled up when the tapped surface itself is textured (brick, stone).
   */
  texture: number;
  /** Max hue-angle difference for colourful seeds, in degrees (× tolerance). */
  hue: number;
}

export const DEFAULT_TUNING: FillTuning = { strong: 0.4, jump: 0.45, baseline: 3, shadeWeight: 0.15, texture: 6, hue: 0.9 };

/** Mean Lab colour of a (2r+1)² window around (x,y), for a stable seed. */
export function sampleLab(lab: Float32Array, w: number, h: number, x: number, y: number, r = 1) {
  let L = 0, a = 0, b = 0, n = 0;
  for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) {
    for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) {
      const o = (yy * w + xx) * 3;
      L += lab[o];
      a += lab[o + 1];
      b += lab[o + 2];
      n++;
    }
  }
  return [L / n, a / n, b / n] as const;
}

/**
 * Shade-aware distance² from a seed colour.
 *
 * The same paint in shadow is darker AND less saturated (its a/b shrink with
 * lightness), so for colourful seeds we compare against the seed colour
 * "dimmed" to the pixel's lightness and count lightness itself only a little.
 * Neutral seeds (white, grey, black) keep full lightness weight, otherwise a
 * white wall would match grey sky and every shadow in the photo.
 */
export function makeShadeDistance(seed: readonly [number, number, number], shadeWeight: number, hueTolerance = Infinity) {
  const [sL, sa, sb] = seed;
  const chroma = Math.hypot(sa, sb);
  const colourful = Math.min(1, Math.max(0, (chroma - 6) / 14)); // 0 at C≤6, 1 at C≥20
  const lw = 1 - (1 - shadeWeight) * colourful;
  // Near-black pixels have meaningless hue (window interiors, deep shadow).
  const darkFloor = colourful > 0 ? sL * 0.25 : 0;
  // Painted walls keep a very steady hue in sun and shade; foliage wanders.
  const seedHue = Math.atan2(sb, sa);
  const hueTol = colourful >= 0.5 ? (hueTolerance * Math.PI) / 180 : Infinity;
  return (L: number, a: number, b: number) => {
    if (L < darkFloor) return Infinity;
    let ea = sa;
    let eb = sb;
    if (colourful > 0) {
      if (hueTol !== Infinity && a * a + b * b > 9) {
        let dh = Math.abs(Math.atan2(b, a) - seedHue);
        if (dh > Math.PI) dh = 2 * Math.PI - dh;
        if (dh > hueTol) return Infinity;
      }
      const k = Math.min(1.3, Math.pow(Math.max(0.05, L / Math.max(1, sL)), 0.8));
      const f = 1 + (k - 1) * colourful;
      ea *= f;
      eb *= f;
    }
    const dL = (L - sL) * lw;
    const da = a - ea;
    const db = b - eb;
    return dL * dL + da * da + db * db;
  };
}

/** Mean ΔE between each pixel and its 4 neighbours 2 px away: high on leaves, grilles, edges. */
export function textureMap(lab: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  const d = (i: number, j: number) => {
    const a = i * 3;
    const b = j * 3;
    return Math.hypot(lab[a] - lab[b], lab[a + 1] - lab[b + 1], lab[a + 2] - lab[b + 2]);
  };
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x;
      out[i] = (d(i, i - 2) + d(i, i + 2) + d(i, i - 2 * w) + d(i, i + 2 * w)) / 4;
    }
  }
  return out;
}

export function floodFill(
  lab: Float32Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
  opts: FillOptions,
): Uint8Array {
  const n = w * h;
  const out = new Uint8Array(n);
  sx = Math.round(sx);
  sy = Math.round(sy);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return out;

  const t = { ...DEFAULT_TUNING, ...opts.tuning };
  const tol = opts.tolerance;
  const tol2 = tol * tol;
  const edges = opts.edges ?? null;
  const seed = sampleLab(lab, w, h, sx, sy, 1);
  const [sL, sa, sb] = seed;
  const shadeDist2 = makeShadeDistance(seed, t.shadeWeight, tol * t.hue);
  const shadeMatch = (i: number) => {
    const o = i * 3;
    return shadeDist2(lab[o], lab[o + 1], lab[o + 2]) <= tol2;
  };

  // How busy the tapped surface is, so brick/stone walls aren't mistaken for foliage.
  const tex = opts.texture ?? textureMap(lab, w, h);
  let seedTex = 0;
  let seedTexN = 0;
  for (let y = Math.max(0, sy - 3); y <= Math.min(h - 1, sy + 3); y++)
    for (let x = Math.max(0, sx - 3); x <= Math.min(w - 1, sx + 3); x++) {
      seedTex += tex[y * w + x];
      seedTexN++;
    }
  const busy = Math.max(t.texture + tol * 0.2, (seedTex / seedTexN) * 2.5);

  if (!opts.contiguous) {
    for (let i = 0; i < n; i++) if (!(edges && edges[i]) && tex[i] <= busy && shadeMatch(i)) out[i] = 255;
    // Grow back up to 2 px into matching edge pixels skipped as "busy".
    const grown = dilate(out, w, h, 2);
    for (let i = 0; i < n; i++) if (grown[i] && !out[i] && !(edges && edges[i]) && shadeMatch(i)) out[i] = 255;
  } else {
    // A pixel joins the fill when it is
    //  1. a strong plain-colour match to the tapped colour, or
    //  2. a shade-aware match (same paint in light or shadow) that is NOT across
    //     a sharp jump. That keeps out trim, frames and sky even when they are
    //     close in colour, while shadows that fade in gradually are followed.
    const strong2 = (tol * t.strong) ** 2;
    const jump2 = Math.max(2, tol * t.jump) ** 2;
    // Boundaries in photos (and JPEGs) are soft 2–3 px ramps, so compare with
    // the pixel `baseline` steps back along the fill direction, not the neighbour.
    const base = t.baseline;
    const accept = (from: number, to: number) => {
      if (edges && edges[to]) return false;
      const b = to * 3;
      const dL = lab[b] - sL;
      const da = lab[b + 1] - sa;
      const db = lab[b + 2] - sb;
      if (dL * dL + da * da + db * db <= strong2) return true;
      if (!shadeMatch(to)) return false;
      const dir = to - from;
      let ref = to - dir * base;
      const horizontal = dir === 1 || dir === -1;
      if (ref < 0 || ref >= n || (horizontal && ((ref / w) | 0) !== ((to / w) | 0))) ref = from;
      const a = ref * 3;
      const jL = lab[a] - lab[b];
      const ja = lab[a + 1] - lab[b + 1];
      const jb = lab[a + 2] - lab[b + 2];
      return jL * jL + ja * ja + jb * jb <= jump2;
    };

    // Breadth-first. A pixel is queued again only if reached by a shorter busy
    // run (at most MAX_BUSY + 1 times), so the queue grows on demand.
    let queue = new Int32Array(n + 1024);
    let head = 0;
    let tail = 0;
    const start = sy * w + sx;
    out[start] = 255;
    queue[tail++] = start;
    // Busy pixels (leaves, grille bars, edges) can join the fill, but only up
    // to MAX_BUSY steps in a row — enough to reach a real edge, not enough to
    // tunnel through a bush.
    const MAX_BUSY = 2;
    const busyRun = new Uint8Array(n);
    const visit = (from: number, to: number) => {
      const run = tex[to] > busy ? busyRun[from] + 1 : 0;
      if (run > MAX_BUSY || (out[to] && busyRun[to] <= run)) return;
      if (!out[to] && !accept(from, to)) return;
      busyRun[to] = run;
      out[to] = 255;
      if (tail === queue.length) {
        const bigger = new Int32Array(queue.length * 2);
        bigger.set(queue);
        queue = bigger;
      }
      queue[tail++] = to;
    };
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      if (x > 0) visit(i, i - 1);
      if (x < w - 1) visit(i, i + 1);
      if (i >= w) visit(i, i - w);
      if (i + w < n) visit(i, i + w);
    }
  }

  const r = opts.closeRadius ?? 1;
  const closed = r > 0 ? closeMask(out, w, h, r) : out;
  // "Everywhere" picks up stray matches (a leaf, a reflection): drop tiny blobs.
  return opts.contiguous ? closed : removeSmallComponents(closed, w, h, Math.max(48, Math.round(n * 0.0004)));
}

/** Clears 4-connected regions smaller than `minArea` pixels, in place. */
export function removeSmallComponents(mask: Uint8Array, w: number, h: number, minArea: number): Uint8Array {
  const n = w * h;
  const seen = new Uint8Array(n);
  const stack = new Int32Array(n);
  const region: number[] = [];
  for (let s = 0; s < n; s++) {
    if (!mask[s] || seen[s]) continue;
    let sp = 0;
    stack[sp++] = s;
    seen[s] = 1;
    region.length = 0;
    while (sp > 0) {
      const i = stack[--sp];
      region.push(i);
      const x = i % w;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
      if (i >= w && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[sp++] = i - w; }
      if (i + w < n && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[sp++] = i + w; }
    }
    if (region.length < minArea) for (const i of region) mask[i] = 0;
  }
  return mask;
}

/** Sobel edge map on the L channel. Returns 1 where gradient ≥ threshold. */
export function computeEdges(lab: Float32Array, w: number, h: number, threshold = 45): Uint8Array {
  const out = new Uint8Array(w * h);
  // Clamp at the borders so edges reach the image boundary (no leak around them).
  const L = (x: number, y: number) =>
    lab[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 3];
  const t2 = threshold * threshold;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx =
        -L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1) +
        L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1);
      const gy =
        -L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1) +
        L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1);
      if (gx * gx + gy * gy >= t2) out[y * w + x] = 1;
    }
  }
  return out;
}

function morph(src: Uint8Array, w: number, h: number, r: number, isMax: boolean): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const pick = isMax ? Math.max : Math.min;
  // horizontal pass
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = src[row + x];
      for (let k = 1; k <= r; k++) {
        if (x - k >= 0) v = pick(v, src[row + x - k]);
        if (x + k < w) v = pick(v, src[row + x + k]);
      }
      tmp[row + x] = v;
    }
  }
  // vertical pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x];
      for (let k = 1; k <= r; k++) {
        if (y - k >= 0) v = pick(v, tmp[(y - k) * w + x]);
        if (y + k < h) v = pick(v, tmp[(y + k) * w + x]);
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

export const dilate = (m: Uint8Array, w: number, h: number, r: number) => morph(m, w, h, r, true);
export const erode = (m: Uint8Array, w: number, h: number, r: number) => morph(m, w, h, r, false);

/** Morphological close: fills pinholes and hairline gaps (noise, texture). */
export function closeMask(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  return erode(dilate(m, w, h, r), w, h, r);
}
