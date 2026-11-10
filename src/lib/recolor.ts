// Realistic recolouring: swap hue/chroma for the paint colour while keeping
// the photo's own light and shadow (lightness variation) and texture.

import { hexToLab, labToRgbInto } from "./color";

export interface PaintLayer {
  /** Soft mask (0–255) used as per-pixel coverage. */
  mask: Uint8Array;
  /** Mean original lightness inside the section. */
  meanL: number;
  hex: string;
  /** 0–1 */
  opacity: number;
}

/** Mean Lab lightness of the original pixels covered by the mask. */
export function meanLightness(lab: Float32Array, mask: Uint8Array): number {
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i];
    if (m === 0) continue;
    sum += lab[i * 3] * m;
    wsum += m;
  }
  return wsum > 0 ? sum / wsum : 50;
}

/** Paint colour for one pixel given its original lightness. */
export function paintPixel(
  pixelL: number,
  meanL: number,
  target: readonly [number, number, number],
  out: Uint8ClampedArray,
  o: number,
) {
  const ratio = Math.min(3, pixelL / Math.max(5, meanL));
  const L = Math.min(100, Math.max(0, target[0] * ratio));
  // Shadows lose a bit of chroma, highlights stay close to the swatch.
  const c = Math.min(1.15, ratio);
  labToRgbInto(L, target[1] * c, target[2] * c, out, o);
}

/**
 * Composites `layers` (in order) over `original` into `out` (RGBA).
 * `lab` is the original image in interleaved Lab.
 */
export function composite(
  original: Uint8ClampedArray,
  lab: Float32Array,
  layers: PaintLayer[],
  out: Uint8ClampedArray,
) {
  out.set(original);
  const px = new Uint8ClampedArray(3);
  for (const layer of layers) {
    if (layer.opacity <= 0) continue;
    const target = hexToLab(layer.hex);
    const { mask, meanL, opacity } = layer;
    for (let i = 0; i < mask.length; i++) {
      const m = mask[i];
      if (m === 0) continue;
      const alpha = (m / 255) * opacity;
      paintPixel(lab[i * 3], meanL, target, px, 0);
      const o = i * 4;
      out[o] = out[o] + (px[0] - out[o]) * alpha;
      out[o + 1] = out[o + 1] + (px[1] - out[o + 1]) * alpha;
      out[o + 2] = out[o + 2] + (px[2] - out[o + 2]) * alpha;
    }
  }
}
