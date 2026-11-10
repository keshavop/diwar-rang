// Browser-only image helpers: decode, orient, downscale, read pixels.

/** Long edge of the working image. Keeps flood fill and recolour fast on phones. */
export const MAX_EDGE = 1600;
const THUMB_EDGE = 480;

type Drawable = ImageBitmap | HTMLImageElement;

async function decode(blob: Blob): Promise<Drawable> {
  try {
    // Applies EXIF rotation from phone cameras.
    return await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    // Fallback (e.g. SVG in some browsers).
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function sizeOf(src: Drawable) {
  return "naturalWidth" in src
    ? { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height }
    : { w: src.width, h: src.height };
}

function fit(w: number, h: number, max: number) {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), type, quality),
  );
}

function draw(src: CanvasImageSource, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

export async function prepareUpload(file: Blob) {
  if (file.type && !file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const src = await decode(file);
  const { w: sw, h: sh } = sizeOf(src);
  if (!sw || !sh) throw new Error("This image could not be read.");
  const { w, h } = fit(sw, sh, MAX_EDGE);
  const work = draw(src, w, h);
  const t = fit(w, h, THUMB_EDGE);
  const thumbCanvas = draw(work, t.w, t.h);
  const [image, thumb] = await Promise.all([
    toBlob(work, "image/jpeg", 0.92),
    toBlob(thumbCanvas, "image/jpeg", 0.82),
  ]);
  if ("close" in src) src.close();
  return { image, thumb, width: w, height: h };
}

/** Decodes a stored working image at exactly width×height and returns its pixels. */
export async function loadPixels(blob: Blob, width: number, height: number): Promise<ImageData> {
  const src = await decode(blob);
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, width, height);
  if ("close" in src) src.close();
  return ctx.getImageData(0, 0, width, height);
}

export async function canvasThumb(canvas: HTMLCanvasElement): Promise<Blob> {
  const t = fit(canvas.width, canvas.height, THUMB_EDGE);
  return toBlob(draw(canvas, t.w, t.h), "image/jpeg", 0.82);
}

export async function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const blob = await toBlob(canvas, "image/png");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") + ".png";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
