export interface Swatch {
  name: string;
  hex: string;
}

export interface PaletteGroup {
  name: string;
  swatches: Swatch[];
}

export const PALETTE: PaletteGroup[] = [
  {
    name: "Whites & neutrals",
    swatches: [
      { name: "Chalk White", hex: "#f4f1ea" },
      { name: "Linen", hex: "#ece3d4" },
      { name: "Oat", hex: "#dccfb8" },
      { name: "Greige", hex: "#bdb3a3" },
      { name: "Pebble", hex: "#a39e95" },
      { name: "Slate Grey", hex: "#6f7378" },
      { name: "Charcoal", hex: "#3d3f43" },
      { name: "Soft Black", hex: "#232323" },
    ],
  },
  {
    name: "Warm",
    swatches: [
      { name: "Butter", hex: "#f2dc9b" },
      { name: "Mustard", hex: "#d4a338" },
      { name: "Apricot", hex: "#eeb58a" },
      { name: "Terracotta", hex: "#c0643f" },
      { name: "Brick Red", hex: "#8f3a2b" },
      { name: "Blush", hex: "#e8c2bb" },
      { name: "Dusty Rose", hex: "#c48b86" },
      { name: "Burgundy", hex: "#5e2129" },
    ],
  },
  {
    name: "Cool",
    swatches: [
      { name: "Mist Blue", hex: "#cfdde3" },
      { name: "Sky", hex: "#9cc3d9" },
      { name: "Denim", hex: "#5677a1" },
      { name: "Navy", hex: "#22344f" },
      { name: "Teal", hex: "#2f6f73" },
      { name: "Mint", hex: "#c7e2cf" },
      { name: "Lavender", hex: "#c3b8d8" },
      { name: "Plum", hex: "#5a3e5d" },
    ],
  },
  {
    name: "Earth & greens",
    swatches: [
      { name: "Sage", hex: "#a9b79a" },
      { name: "Olive", hex: "#6f7247" },
      { name: "Forest", hex: "#2f4a3a" },
      { name: "Moss", hex: "#7c8a5a" },
      { name: "Sand", hex: "#cdb48c" },
      { name: "Clay", hex: "#a77b5b" },
      { name: "Walnut", hex: "#5b4232" },
      { name: "Taupe", hex: "#8a7b6d" },
    ],
  },
];

/** Colours handed to newly created sections, in order. */
export const STARTER_COLORS = ["#dccfb8", "#f4f1ea", "#22344f", "#c0643f", "#a9b79a", "#6f7378", "#d4a338", "#2f6f73"];

export const SECTION_NAME_IDEAS = ["Main wall", "Trim", "Door", "Window frames", "Roof", "Accent wall", "Pillars", "Gate"];
