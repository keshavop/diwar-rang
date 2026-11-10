export type Tool = "fill" | "polygon" | "brush" | "erase" | "move";

export interface SectionColor {
  hex: string;
  /** 0–1 */
  opacity: number;
}

export interface Section {
  id: string;
  name: string;
}

export interface Scheme {
  id: string;
  name: string;
  /** sectionId -> colour. Sections without an entry stay unpainted in this scheme. */
  colors: Record<string, SectionColor>;
}

export interface ProjectDoc {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Working image size; every mask matches it. */
  width: number;
  height: number;
  sections: Section[];
  schemes: Scheme[];
  activeSchemeId: string;
}
