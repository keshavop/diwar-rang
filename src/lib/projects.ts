import { createProject, newId } from "./db";
import { prepareUpload } from "./image";
import type { ProjectDoc } from "./types";

export async function createProjectFromImage(blob: Blob, name: string): Promise<string> {
  const { image, thumb, width, height } = await prepareUpload(blob);
  const now = Date.now();
  const schemeId = newId();
  const doc: ProjectDoc = {
    id: newId(),
    name: name.trim() || "My house",
    createdAt: now,
    updatedAt: now,
    width,
    height,
    sections: [],
    schemes: [{ id: schemeId, name: "Scheme 1", colors: {} }],
    activeSchemeId: schemeId,
  };
  await createProject(doc, image, thumb);
  return doc.id;
}

export function nameFromFile(file: File): string {
  const base = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base && !/^(img|dsc|pxl|image)\s?\d+/i.test(base) ? base.slice(0, 40) : "My house";
}
