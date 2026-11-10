// sRGB <-> CIE Lab (D65) helpers tuned for per-pixel loops.

const XN = 0.95047;
const YN = 1.0;
const ZN = 1.08883;
const EPS = 216 / 24389;
const KAPPA = 24389 / 27;

/** sRGB byte -> linear [0,1] */
const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** linear [0,1] -> sRGB byte, sampled at 4096 steps */
const LUT_SIZE = 4096;
const LINEAR_TO_SRGB = new Uint8ClampedArray(LUT_SIZE + 1);
for (let i = 0; i <= LUT_SIZE; i++) {
  const c = i / LUT_SIZE;
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  LINEAR_TO_SRGB[i] = Math.round(v * 255);
}

function linearToByte(c: number): number {
  if (c <= 0) return 0;
  if (c >= 1) return 255;
  return LINEAR_TO_SRGB[(c * LUT_SIZE + 0.5) | 0];
}

function f(t: number): number {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function fInv(t: number): number {
  const t3 = t * t * t;
  return t3 > EPS ? t3 : (116 * t - 16) / KAPPA;
}

export type Lab = [number, number, number];
export type RGB = [number, number, number];

export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = SRGB_TO_LINEAR[r];
  const lg = SRGB_TO_LINEAR[g];
  const lb = SRGB_TO_LINEAR[b];
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / XN;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175) / YN;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / ZN;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Writes r,g,b bytes into `out` at offset `o`. */
export function labToRgbInto(L: number, a: number, b: number, out: Uint8ClampedArray, o: number) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const x = fInv(fx) * XN;
  const y = (L > KAPPA * EPS ? fy * fy * fy : L / KAPPA) * YN;
  const z = fInv(fz) * ZN;
  const lr = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const lg = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const lb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  out[o] = linearToByte(lr);
  out[o + 1] = linearToByte(lg);
  out[o + 2] = linearToByte(lb);
}

export function labToRgb(L: number, a: number, b: number): RGB {
  const out = new Uint8ClampedArray(3);
  labToRgbInto(L, a, b, out, 0);
  return [out[0], out[1], out[2]];
}

export function hexToRgb(hex: string): RGB {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [0, 0, 0];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

export function isValidHex(hex: string): boolean {
  return /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex.trim());
}

/** Converts RGBA pixels to an interleaved Float32 Lab buffer (L,a,b per pixel). */
export function imageToLab(rgba: Uint8ClampedArray): Float32Array {
  const n = rgba.length >> 2;
  const out = new Float32Array(n * 3);
  for (let i = 0, p = 0, o = 0; i < n; i++, p += 4, o += 3) {
    const lr = SRGB_TO_LINEAR[rgba[p]];
    const lg = SRGB_TO_LINEAR[rgba[p + 1]];
    const lb = SRGB_TO_LINEAR[rgba[p + 2]];
    const fx = f((lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / XN);
    const fy = f(lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175);
    const fz = f((lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / ZN);
    out[o] = 116 * fy - 16;
    out[o + 1] = 500 * (fx - fy);
    out[o + 2] = 200 * (fy - fz);
  }
  return out;
}

/** Relative luminance-based readable text colour for a swatch. */
export function readableOn(hex: string): "#000000" | "#ffffff" {
  return hexToLab(hex)[0] > 60 ? "#000000" : "#ffffff";
}
