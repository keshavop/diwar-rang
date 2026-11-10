# DiwarRang

*Diwar* (wall) + *Rang* (colour).

**Live:** https://diwarrang.vercel.app

Try paint colours on a photo of your house or wall before you buy any paint.

- **Upload** a photo (or use the built-in sample house). It's scaled to a 1600px long edge, and phone photos are rotated correctly.
- **Select sections** (wall, trim, door…):
  - **Fill**: tap an area. It's edge-aware, follows smooth shadows, and stops at trim and frames. It has a tolerance setting, "everywhere" mode and optional "stop at edges".
  - **Shape**: tap the corners of a polygon.
  - **Brush / Erase**: touch up the edges.
  - Add or Remove mode, and undo/redo.
- **Start over**: **Reset colours** unpaints every section in the current scheme, and **Reset shapes** clears every selection but keeps your sections and colours. Both can be undone.
- **Paint realistically**: the paint colour replaces hue and chroma, while the photo's own lightness (shadows, texture) is kept. Each section has its own paint strength.
- **Colour schemes**: several colour sets per photo, so you can switch and compare them.
- **Compare**: drag a before/after slider. **Export** downloads a PNG.
- **Saved locally**: everything is stored in this browser's IndexedDB, with no backend. Masks are stored gzipped.

## Stack

Next.js 16 (App Router), Tailwind CSS v4, shadcn/ui (Base UI), zustand, idb-keyval, react-colorful, react-zoom-pan-pinch, vitest.

## Develop

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # unit tests for flood fill, masks and recolouring
npm run lint
npm run build
```

## Layout

- `src/lib/`: framework-free image code:
  - `color.ts`: sRGB ↔ Lab
  - `floodFill.ts`
  - `mask.ts`
  - `recolor.ts`
  - `image.ts`
  - `db.ts`: IndexedDB storage
- `src/store/editor.ts`: editor state, undo/redo and debounced autosave
- `src/components/editor/`: canvas, toolbar, panels
- `src/components/gallery/`: project list and upload

Keyboard shortcuts:

| Key | Action |
| --- | --- |
| `F` | Fill |
| `P` | Shape |
| `B` | Brush |
| `E` | Erase |
| `M` | Move |
| `C` | Compare |
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `Enter` / `Esc` | Finish / cancel a shape |
