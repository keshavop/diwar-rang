// Local, private browser storage (IndexedDB via idb-keyval).
// localStorage is too small (~5 MB, strings only) for photos and masks.

import { createStore, del, delMany, get, keys, set, type UseStore } from "idb-keyval";
import type { ProjectDoc } from "./types";

let store: UseStore | null = null;
function db(): UseStore {
  if (!store) store = createStore("paint-shop", "kv");
  return store;
}

const k = {
  index: "projects:index",
  project: (id: string) => `project:${id}`,
  image: (id: string) => `image:${id}`,
  thumb: (id: string) => `thumb:${id}`,
  mask: (projectId: string, sectionId: string) => `mask:${projectId}:${sectionId}`,
};

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
}

export async function listProjects(): Promise<ProjectDoc[]> {
  const ids = (await get<string[]>(k.index, db())) ?? [];
  const docs = await Promise.all(ids.map((id) => get<ProjectDoc>(k.project(id), db())));
  return docs.filter((d): d is ProjectDoc => !!d).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createProject(doc: ProjectDoc, image: Blob, thumb: Blob) {
  await set(k.image(doc.id), image, db());
  await set(k.thumb(doc.id), thumb, db());
  await set(k.project(doc.id), doc, db());
  const ids = (await get<string[]>(k.index, db())) ?? [];
  await set(k.index, [doc.id, ...ids.filter((i) => i !== doc.id)], db());
}

export const getProject = (id: string) => get<ProjectDoc>(k.project(id), db());
export const saveProject = (doc: ProjectDoc) => set(k.project(doc.id), doc, db());
export const getImage = (id: string) => get<Blob>(k.image(id), db());
export const getThumb = (id: string) => get<Blob>(k.thumb(id), db());
export const saveThumb = (id: string, blob: Blob) => set(k.thumb(id), blob, db());

export async function deleteProject(id: string) {
  const all = (await keys(db())) as string[];
  const maskKeys = all.filter((key) => typeof key === "string" && key.startsWith(`mask:${id}:`));
  await delMany([k.project(id), k.image(id), k.thumb(id), ...maskKeys], db());
  const ids = (await get<string[]>(k.index, db())) ?? [];
  await set(k.index, ids.filter((i) => i !== id), db());
}

// Masks are mostly long runs of 0/255, so gzip shrinks them ~50–200×.
async function compress(data: Uint8Array): Promise<Blob> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

async function decompress(blob: Blob): Promise<Uint8Array> {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function saveMask(projectId: string, sectionId: string, mask: Uint8Array) {
  await set(k.mask(projectId, sectionId), await compress(mask), db());
}

export async function loadMask(projectId: string, sectionId: string, size: number): Promise<Uint8Array> {
  const blob = await get<Blob>(k.mask(projectId, sectionId), db());
  if (!blob) return new Uint8Array(size);
  const data = await decompress(blob);
  return data.length === size ? data : new Uint8Array(size);
}

export const deleteMask = (projectId: string, sectionId: string) => del(k.mask(projectId, sectionId), db());
