import { describe, expect, it } from "vitest";
import { imageToLab } from "../color";
import { computeEdges, floodFill } from "../floodFill";
import { fillPolygon, maskArea, stampLine, combineMask } from "../mask";

/** Builds an RGBA image from a per-pixel colour function. */
function makeImage(w: number, h: number, px: (x: number, y: number) => [number, number, number]) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      const o = (y * w + x) * 4;
      rgba[o] = r;
      rgba[o + 1] = g;
      rgba[o + 2] = b;
      rgba[o + 3] = 255;
    }
  return imageToLab(rgba);
}

describe("floodFill", () => {
  const w = 40;
  const h = 20;
  // left half beige wall, right half dark-blue door
  const lab = makeImage(w, h, (x) => (x < 20 ? [220, 200, 170] : [30, 40, 90]));

  it("selects only the connected similar region", () => {
    const m = floodFill(lab, w, h, 5, 5, { tolerance: 15, contiguous: true, closeRadius: 0 });
    expect(maskArea(m)).toBe(20 * 20);
    expect(m[5 * w + 5]).toBe(255);
    expect(m[5 * w + 30]).toBe(0);
  });

  it("follows a shadow across the same coloured wall", () => {
    // Same green paint, getting much darker towards the top (like under an overhang).
    const tall = 60;
    const shaded = makeImage(w, tall, (_x, y) => {
      const k = 0.3 + 0.7 * (y / (tall - 1));
      return [110 * k, 160 * k, 60 * k];
    });
    const m = floodFill(shaded, w, tall, 5, tall - 2, { tolerance: 10, contiguous: true, closeRadius: 0 });
    expect(maskArea(m)).toBe(w * tall);
  });

  it("everywhere mode finds the same paint in sun and shade, but not other colours", () => {
    const img = makeImage(w, h, (x) => (x < 10 ? [110, 160, 60] : x < 20 ? [55, 80, 30] : x < 30 ? [170, 60, 40] : [200, 200, 200]));
    const m = floodFill(img, w, h, 2, 2, { tolerance: 10, contiguous: false, closeRadius: 0 });
    expect(m[5 * w + 15]).toBe(255); // shaded green
    expect(m[5 * w + 25]).toBe(0); // red
    expect(m[5 * w + 35]).toBe(0); // grey
  });

  it("everywhere mode skips foliage whose green has a different hue", () => {
    // Wall green (hue ≈114°) vs a bluer leaf green of similar lightness and chroma.
    const img = makeImage(w, h, (x) => (x < 20 ? [95, 120, 45] : [60, 125, 70]));
    const m = floodFill(img, w, h, 2, 2, { tolerance: 10, contiguous: false, closeRadius: 0 });
    expect(m[5 * w + 10]).toBe(255);
    expect(m[5 * w + 30]).toBe(0);
  });

  it("everywhere mode drops tiny stray blobs", () => {
    const W2 = 200, H2 = 200;
    // big green block plus a 3×3 green speck far away, on grey
    const img = makeImage(W2, H2, (x, y) => ((x < 100 && y < 100) || (x >= 150 && x < 153 && y >= 150 && y < 153) ? [95, 120, 45] : [128, 128, 128]));
    const m = floodFill(img, W2, H2, 10, 10, { tolerance: 10, contiguous: false, closeRadius: 0 });
    expect(m[10 * W2 + 10]).toBe(255);
    expect(m[151 * W2 + 151]).toBe(0);
  });

  it("a white seed does not swallow grey areas", () => {
    const img = makeImage(w, h, (x) => (x < 20 ? [235, 235, 235] : [170, 170, 172]));
    const m = floodFill(img, w, h, 2, 2, { tolerance: 10, contiguous: false, closeRadius: 0 });
    expect(maskArea(m)).toBe(20 * h);
  });

  it("does not leak into off-white trim next to a beige wall", () => {
    // Beige wall (left) next to off-white trim (right) — a sharp, low-contrast boundary.
    const trim = makeImage(w, h, (x) => (x < 20 ? [230, 220, 200] : [243, 239, 231]));
    for (const tolerance of [8, 10, 12]) {
      const m = floodFill(trim, w, h, 5, 5, { tolerance, contiguous: true, closeRadius: 0 });
      expect(maskArea(m)).toBe(20 * 20);
    }
  });

  it("does not chain through a sill into the trim", () => {
    // wall | sill (close to wall) | trim (close to sill)
    const chain = makeImage(w, h, (x) => (x < 20 ? [226, 217, 200] : x < 24 ? [236, 230, 218] : [246, 239, 229]));
    const m = floodFill(chain, w, h, 5, 5, { tolerance: 10, contiguous: true, closeRadius: 0 });
    expect(m[5 * w + 30]).toBe(0);
    expect(m[5 * w + 10]).toBe(255);
  });

  it("does not creep over a soft (JPEG-like) edge into the trim", () => {
    // wall, then a 3 px ramp, then trim — every single step is small.
    const wall = [226, 217, 200];
    const trimC = [246, 239, 229];
    const soft = makeImage(w, h, (x) => {
      const t = Math.min(1, Math.max(0, (x - 19) / 4));
      return wall.map((v, i) => v + (trimC[i] - v) * t) as [number, number, number];
    });
    const m = floodFill(soft, w, h, 5, 5, { tolerance: 10, contiguous: true, closeRadius: 0 });
    expect(m[5 * w + 30]).toBe(0);
    expect(m[5 * w + 10]).toBe(255);
  });

  it("non-contiguous mode picks matching pixels anywhere", () => {
    const stripes = makeImage(w, h, (x) => (x % 10 < 5 ? [200, 50, 50] : [50, 200, 50]));
    const contiguous = floodFill(stripes, w, h, 0, 0, { tolerance: 10, contiguous: true, closeRadius: 0 });
    const global = floodFill(stripes, w, h, 0, 0, { tolerance: 10, contiguous: false, closeRadius: 0 });
    expect(maskArea(contiguous)).toBe(5 * h);
    expect(maskArea(global)).toBe(20 * h);
  });

  it("stops at an edge barrier", () => {
    // Uniform colour but a thin dark line at x = 20.
    const lined = makeImage(w, h, (x) => (x === 20 ? [0, 0, 0] : [200, 200, 200]));
    const edges = computeEdges(lined, w, h, 45);
    const m = floodFill(lined, w, h, 2, 2, { tolerance: 100, contiguous: true, edges, closeRadius: 0 });
    expect(m[5 * w + 30]).toBe(0);
    expect(m[5 * w + 5]).toBe(255);
  });

  it("returns an empty mask for out-of-bounds taps", () => {
    const m = floodFill(lab, w, h, -3, 5, { tolerance: 15, contiguous: true });
    expect(maskArea(m)).toBe(0);
  });
});

describe("mask helpers", () => {
  it("rasterises a polygon", () => {
    const m = fillPolygon(10, 10, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
    expect(maskArea(m)).toBe(100);
    const tri = fillPolygon(10, 10, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ]);
    expect(maskArea(tri)).toBeGreaterThan(40);
    expect(maskArea(tri)).toBeLessThan(60);
  });

  it("brush paints and erases", () => {
    const m = new Uint8Array(100 * 100);
    stampLine(m, 100, 100, { x: 10, y: 50 }, { x: 90, y: 50 }, 5, 255);
    expect(m[50 * 100 + 50]).toBe(255);
    stampLine(m, 100, 100, { x: 50, y: 50 }, { x: 50, y: 50 }, 6, 0);
    expect(m[50 * 100 + 50]).toBe(0);
    expect(m[50 * 100 + 20]).toBe(255);
  });

  it("subtract mode removes area", () => {
    const a = new Uint8Array([255, 255, 255, 0]);
    combineMask(a, new Uint8Array([0, 255, 0, 255]), "subtract");
    expect(Array.from(a)).toEqual([255, 0, 255, 0]);
    combineMask(a, new Uint8Array([0, 0, 0, 255]), "add");
    expect(Array.from(a)).toEqual([255, 0, 255, 255]);
  });
});
