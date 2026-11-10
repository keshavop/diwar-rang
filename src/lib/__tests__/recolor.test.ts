import { describe, expect, it } from "vitest";
import { hexToLab, hexToRgb, imageToLab, labToRgb, rgbToHex, rgbToLab } from "../color";
import { composite, meanLightness } from "../recolor";

describe("color conversion", () => {
  it("round-trips sRGB through Lab", () => {
    for (const hex of ["#ffffff", "#000000", "#c0392b", "#2e86de", "#7d6b52"]) {
      const [L, a, b] = hexToLab(hex);
      const [r, g, bb] = labToRgb(L, a, b);
      const [r0, g0, b0] = hexToRgb(hex);
      expect(Math.abs(r - r0)).toBeLessThanOrEqual(1);
      expect(Math.abs(g - g0)).toBeLessThanOrEqual(1);
      expect(Math.abs(bb - b0)).toBeLessThanOrEqual(1);
    }
  });

  it("parses short hex and formats hex", () => {
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(rgbToHex(18, 52, 86)).toBe("#123456");
  });

  it("white has L≈100", () => {
    expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 0);
  });
});

describe("composite", () => {
  // 2×1 image: a lit pixel and a shadowed pixel of the same beige wall.
  const original = new Uint8ClampedArray([230, 215, 190, 255, 140, 130, 115, 255]);
  const lab = imageToLab(original);
  const mask = new Uint8Array([255, 255]);

  it("keeps the shadow darker than the lit area after painting", () => {
    const out = new Uint8ClampedArray(original.length);
    composite(original, lab, [{ mask, meanL: meanLightness(lab, mask), hex: "#3a6ea5", opacity: 1 }], out);
    const litL = rgbToLab(out[0], out[1], out[2])[0];
    const shadowL = rgbToLab(out[4], out[5], out[6])[0];
    expect(litL).toBeGreaterThan(shadowL + 10);
    // Painted pixels are blue-ish now.
    expect(out[2]).toBeGreaterThan(out[0]);
    expect(out[6]).toBeGreaterThan(out[4]);
  });

  it("leaves unmasked pixels and zero opacity untouched", () => {
    const out = new Uint8ClampedArray(original.length);
    composite(original, lab, [{ mask: new Uint8Array([0, 255]), meanL: 50, hex: "#ff0000", opacity: 0 }], out);
    expect(Array.from(out)).toEqual(Array.from(original));
    composite(original, lab, [{ mask: new Uint8Array([0, 255]), meanL: 50, hex: "#ff0000", opacity: 1 }], out);
    expect(Array.from(out.slice(0, 4))).toEqual(Array.from(original.slice(0, 4)));
  });

  it("half opacity lands between original and paint", () => {
    const full = new Uint8ClampedArray(8);
    const half = new Uint8ClampedArray(8);
    const layer = { mask, meanL: meanLightness(lab, mask), hex: "#3a6ea5", opacity: 1 };
    composite(original, lab, [layer], full);
    composite(original, lab, [{ ...layer, opacity: 0.5 }], half);
    expect(half[2]).toBeGreaterThan(Math.min(original[2], full[2]) - 1);
    expect(half[2]).toBeLessThan(Math.max(original[2], full[2]) + 1);
    expect(Math.abs(half[0] - (original[0] + full[0]) / 2)).toBeLessThanOrEqual(1);
  });
});
