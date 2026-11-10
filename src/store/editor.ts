"use client";

import { create } from "zustand";
import { imageToLab } from "@/lib/color";
import {
  deleteMask,
  getImage,
  getProject,
  loadMask,
  newId,
  saveMask,
  saveProject,
  saveThumb,
} from "@/lib/db";
import { computeEdges, floodFill, textureMap } from "@/lib/floodFill";
import { canvasThumb, loadPixels } from "@/lib/image";
import { combineMask, fillPolygon, stampLine, type MaskMode, type Point } from "@/lib/mask";
import { STARTER_COLORS } from "@/lib/palette";
import type { ProjectDoc, Scheme, SectionColor, Tool } from "@/lib/types";

export interface ImageState {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  lab: Float32Array;
  edges: Uint8Array | null;
  texture: Float32Array | null;
}

interface HistoryEntry {
  sectionId: string;
  /** Mask to restore. Arrays in history are never mutated. */
  mask: Uint8Array;
}

const HISTORY_LIMIT = 15;

type Status = "loading" | "ready" | "missing" | "error";

interface EditorState {
  status: Status;
  project: ProjectDoc | null;
  img: ImageState | null;
  masks: Record<string, Uint8Array>;
  /** Bumped whenever a section's mask pixels change. */
  versions: Record<string, number>;
  activeSectionId: string | null;
  tool: Tool;
  mode: MaskMode;
  tolerance: number;
  brushSize: number;
  contiguous: boolean;
  edgeStop: boolean;
  polygon: Point[];
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  compare: boolean;
  saveState: "saved" | "pending" | "saving";

  load: (id: string) => Promise<void>;
  setTool: (tool: Tool) => void;
  setMode: (mode: MaskMode) => void;
  setTolerance: (v: number) => void;
  setBrushSize: (v: number) => void;
  setContiguous: (v: boolean) => void;
  setEdgeStop: (v: boolean) => void;
  setCompare: (v: boolean) => void;

  renameProject: (name: string) => void;

  addSection: (name?: string) => string;
  renameSection: (id: string, name: string) => void;
  deleteSection: (id: string) => void;
  clearSection: (id: string) => void;
  setActiveSection: (id: string | null) => void;

  setSectionColor: (id: string, hex: string) => void;
  setSectionOpacity: (id: string, opacity: number) => void;
  removeSectionColor: (id: string) => void;

  addScheme: (name: string, copyActive: boolean) => void;
  renameScheme: (id: string, name: string) => void;
  deleteScheme: (id: string) => void;
  setActiveScheme: (id: string) => void;

  fillAt: (x: number, y: number) => void;
  addPolygonPoint: (p: Point) => void;
  undoPolygonPoint: () => void;
  cancelPolygon: () => void;
  commitPolygon: () => void;
  beginStroke: (p: Point) => boolean;
  strokeTo: (p: Point) => void;
  endStroke: () => void;
  cancelStroke: () => void;

  undo: () => void;
  redo: () => void;
}

// ---- persistence (module scope: not part of React state) -----------------

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let thumbTimer: ReturnType<typeof setTimeout> | null = null;
const dirtyMasks = new Set<string>();
let compositeCanvas: HTMLCanvasElement | null = null;
let loadToken = 0;

export function registerCompositeCanvas(canvas: HTMLCanvasElement | null) {
  compositeCanvas = canvas;
}

export function getCompositeCanvas() {
  return compositeCanvas;
}

// ---- brush stroke scratch state -------------------------------------------

let stroke: { sectionId: string; before: Uint8Array; working: Uint8Array; last: Point; value: number } | null = null;

function activeScheme(project: ProjectDoc): Scheme {
  return project.schemes.find((s) => s.id === project.activeSchemeId) ?? project.schemes[0];
}

export const useEditor = create<EditorState>()((set, get) => {
  const scheduleSave = () => {
    set({ saveState: "pending" });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 500);
  };

  const updateProject = (fn: (p: ProjectDoc) => ProjectDoc) => {
    const p = get().project;
    if (!p) return;
    set({ project: { ...fn(p), updatedAt: Date.now() } });
    scheduleSave();
  };

  const updateActiveScheme = (fn: (s: Scheme) => Scheme) =>
    updateProject((p) => {
      const active = activeScheme(p);
      return { ...p, schemes: p.schemes.map((s) => (s.id === active.id ? fn(s) : s)) };
    });

  const bump = (ids: string[]) => {
    const versions = { ...get().versions };
    for (const id of ids) versions[id] = (versions[id] ?? 0) + 1;
    return versions;
  };

  const emptyMask = () => {
    const img = get().img;
    return new Uint8Array(img ? img.width * img.height : 0);
  };

  /** Replaces a section mask, recording undo. `before` must not be mutated afterwards. */
  const commitMask = (sectionId: string, before: Uint8Array, next: Uint8Array) => {
    const { masks, undoStack } = get();
    dirtyMasks.add(sectionId);
    set({
      masks: { ...masks, [sectionId]: next },
      versions: bump([sectionId]),
      undoStack: [...undoStack, { sectionId, mask: before }].slice(-HISTORY_LIMIT),
      redoStack: [],
    });
    scheduleSave();
  };

  const applyMask = (sectionId: string, src: Uint8Array, mode: MaskMode) => {
    const before = get().masks[sectionId] ?? emptyMask();
    const next = before.slice();
    combineMask(next, src, mode);
    commitMask(sectionId, before, next);
  };

  /** Active section, creating one when adding paint and none is selected. */
  const targetSection = (adding: boolean): string | null => {
    const { activeSectionId, project } = get();
    if (activeSectionId && project?.sections.some((s) => s.id === activeSectionId)) return activeSectionId;
    return adding ? get().addSection() : null;
  };

  return {
    status: "loading",
    project: null,
    img: null,
    masks: {},
    versions: {},
    activeSectionId: null,
    tool: "fill",
    mode: "add",
    tolerance: 10,
    brushSize: 18,
    contiguous: true,
    edgeStop: false,
    polygon: [],
    undoStack: [],
    redoStack: [],
    compare: false,
    saveState: "saved",

    load: async (id) => {
      const token = ++loadToken;
      await flushSave();
      stroke = null;
      set({
        status: "loading",
        project: null,
        img: null,
        masks: {},
        versions: {},
        activeSectionId: null,
        polygon: [],
        undoStack: [],
        redoStack: [],
        compare: false,
        saveState: "saved",
      });
      try {
        const doc = await getProject(id);
        const blob = doc && (await getImage(id));
        if (!doc || !blob) {
          if (token === loadToken) set({ status: "missing" });
          return;
        }
        const data = await loadPixels(blob, doc.width, doc.height);
        const lab = imageToLab(data.data);
        const size = doc.width * doc.height;
        const loaded = await Promise.all(doc.sections.map((s) => loadMask(id, s.id, size)));
        if (token !== loadToken) return;
        const masks: Record<string, Uint8Array> = {};
        doc.sections.forEach((s, i) => (masks[s.id] = loaded[i]));
        set({
          status: "ready",
          project: doc,
          img: { width: doc.width, height: doc.height, rgba: data.data, lab, edges: null, texture: null },
          masks,
          versions: Object.fromEntries(doc.sections.map((s) => [s.id, 1])),
          activeSectionId: doc.sections[0]?.id ?? null,
        });
      } catch (e) {
        console.error(e);
        if (token === loadToken) set({ status: "error" });
      }
    },

    setTool: (tool) => {
      if (stroke) get().cancelStroke();
      set({ tool, polygon: tool === "polygon" ? get().polygon : [] });
    },
    setMode: (mode) => set({ mode }),
    setTolerance: (tolerance) => set({ tolerance }),
    setBrushSize: (brushSize) => set({ brushSize }),
    setContiguous: (contiguous) => set({ contiguous }),
    setEdgeStop: (edgeStop) => set({ edgeStop }),
    setCompare: (compare) => {
      if (stroke) get().cancelStroke();
      set({ compare, polygon: [] });
    },

    renameProject: (name) => updateProject((p) => ({ ...p, name })),

    addSection: (name) => {
      const p = get().project;
      if (!p) return "";
      const id = newId();
      const scheme = activeScheme(p);
      const used = new Set(Object.values(scheme.colors).map((c) => c.hex));
      const hex = STARTER_COLORS.find((c) => !used.has(c)) ?? STARTER_COLORS[p.sections.length % STARTER_COLORS.length];
      updateProject((proj) => ({
        ...proj,
        sections: [...proj.sections, { id, name: name || `Section ${proj.sections.length + 1}` }],
        schemes: proj.schemes.map((s) =>
          s.id === scheme.id ? { ...s, colors: { ...s.colors, [id]: { hex, opacity: 0.9 } } } : s,
        ),
      }));
      set({ masks: { ...get().masks, [id]: emptyMask() }, versions: bump([id]), activeSectionId: id });
      return id;
    },

    renameSection: (id, name) =>
      updateProject((p) => ({ ...p, sections: p.sections.map((s) => (s.id === id ? { ...s, name } : s)) })),

    deleteSection: (id) => {
      const p = get().project;
      if (!p) return;
      if (stroke?.sectionId === id) stroke = null;
      updateProject((proj) => ({
        ...proj,
        sections: proj.sections.filter((s) => s.id !== id),
        schemes: proj.schemes.map((s) => {
          const colors = { ...s.colors };
          delete colors[id];
          return { ...s, colors };
        }),
      }));
      const masks = { ...get().masks };
      delete masks[id];
      dirtyMasks.delete(id);
      const remaining = get().project?.sections ?? [];
      set({
        masks,
        undoStack: get().undoStack.filter((e) => e.sectionId !== id),
        redoStack: get().redoStack.filter((e) => e.sectionId !== id),
        activeSectionId: get().activeSectionId === id ? (remaining[remaining.length - 1]?.id ?? null) : get().activeSectionId,
      });
      deleteMask(p.id, id).catch(() => {});
    },

    clearSection: (id) => {
      const before = get().masks[id];
      if (before) commitMask(id, before, emptyMask());
    },

    setActiveSection: (activeSectionId) => {
      if (stroke) get().cancelStroke();
      set({ activeSectionId });
    },

    setSectionColor: (id, hex) =>
      updateActiveScheme((s) => ({
        ...s,
        colors: { ...s.colors, [id]: { hex, opacity: s.colors[id]?.opacity ?? 0.9 } },
      })),

    setSectionOpacity: (id, opacity) =>
      updateActiveScheme((s) => {
        const current: SectionColor | undefined = s.colors[id];
        if (!current) return s;
        return { ...s, colors: { ...s.colors, [id]: { ...current, opacity } } };
      }),

    removeSectionColor: (id) =>
      updateActiveScheme((s) => {
        const colors = { ...s.colors };
        delete colors[id];
        return { ...s, colors };
      }),

    addScheme: (name, copyActive) =>
      updateProject((p) => {
        const id = newId();
        const colors = copyActive ? structuredClone(activeScheme(p).colors) : {};
        return { ...p, schemes: [...p.schemes, { id, name, colors }], activeSchemeId: id };
      }),

    renameScheme: (id, name) =>
      updateProject((p) => ({ ...p, schemes: p.schemes.map((s) => (s.id === id ? { ...s, name } : s)) })),

    deleteScheme: (id) =>
      updateProject((p) => {
        if (p.schemes.length <= 1) return p;
        const schemes = p.schemes.filter((s) => s.id !== id);
        return { ...p, schemes, activeSchemeId: p.activeSchemeId === id ? schemes[0].id : p.activeSchemeId };
      }),

    setActiveScheme: (id) => updateProject((p) => ({ ...p, activeSchemeId: id })),

    fillAt: (x, y) => {
      const { img, mode, tolerance, contiguous, edgeStop } = get();
      if (!img) return;
      const sectionId = targetSection(mode === "add");
      if (!sectionId) return;
      if (edgeStop && !img.edges) img.edges = computeEdges(img.lab, img.width, img.height);
      if (!img.texture) img.texture = textureMap(img.lab, img.width, img.height);
      const m = floodFill(img.lab, img.width, img.height, x, y, {
        tolerance,
        contiguous,
        edges: edgeStop ? img.edges : null,
        texture: img.texture,
        closeRadius: 1,
      });
      applyMask(sectionId, m, mode);
    },

    addPolygonPoint: (p) => set({ polygon: [...get().polygon, p] }),
    undoPolygonPoint: () => set({ polygon: get().polygon.slice(0, -1) }),
    cancelPolygon: () => set({ polygon: [] }),
    commitPolygon: () => {
      const { polygon, img, mode } = get();
      if (!img || polygon.length < 3) return;
      const sectionId = targetSection(mode === "add");
      set({ polygon: [] });
      if (!sectionId) return;
      applyMask(sectionId, fillPolygon(img.width, img.height, polygon), mode);
    },

    beginStroke: (p) => {
      const { img, tool, brushSize } = get();
      if (!img || (tool !== "brush" && tool !== "erase")) return false;
      const sectionId = targetSection(tool === "brush");
      if (!sectionId) return false;
      const before = get().masks[sectionId] ?? emptyMask();
      const working = before.slice();
      const value = tool === "brush" ? 255 : 0;
      stampLine(working, img.width, img.height, p, p, brushSize / 2, value);
      stroke = { sectionId, before, working, last: p, value };
      set({ masks: { ...get().masks, [sectionId]: working }, versions: bump([sectionId]) });
      return true;
    },

    strokeTo: (p) => {
      const { img, brushSize } = get();
      if (!stroke || !img) return;
      stampLine(stroke.working, img.width, img.height, stroke.last, p, brushSize / 2, stroke.value);
      stroke.last = p;
      set({ versions: bump([stroke.sectionId]) });
    },

    endStroke: () => {
      if (!stroke) return;
      const { sectionId, before, working } = stroke;
      stroke = null;
      commitMask(sectionId, before, working);
    },

    cancelStroke: () => {
      if (!stroke) return;
      const { sectionId, before } = stroke;
      stroke = null;
      set({ masks: { ...get().masks, [sectionId]: before }, versions: bump([sectionId]) });
    },

    undo: () => {
      const { undoStack, redoStack, masks } = get();
      const entry = undoStack[undoStack.length - 1];
      if (!entry) return;
      const current = masks[entry.sectionId] ?? emptyMask();
      dirtyMasks.add(entry.sectionId);
      set({
        masks: { ...masks, [entry.sectionId]: entry.mask },
        versions: bump([entry.sectionId]),
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, { sectionId: entry.sectionId, mask: current }],
        activeSectionId: entry.sectionId,
      });
      scheduleSave();
    },

    redo: () => {
      const { undoStack, redoStack, masks } = get();
      const entry = redoStack[redoStack.length - 1];
      if (!entry) return;
      const current = masks[entry.sectionId] ?? emptyMask();
      dirtyMasks.add(entry.sectionId);
      set({
        masks: { ...masks, [entry.sectionId]: entry.mask },
        versions: bump([entry.sectionId]),
        redoStack: redoStack.slice(0, -1),
        undoStack: [...undoStack, { sectionId: entry.sectionId, mask: current }],
        activeSectionId: entry.sectionId,
      });
      scheduleSave();
    },
  };
});

/** Writes pending changes to IndexedDB now. Safe to call any time. */
export async function flushSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const { project, masks } = useEditor.getState();
  if (!project) {
    dirtyMasks.clear();
    return;
  }
  const ids = [...dirtyMasks];
  dirtyMasks.clear();
  useEditor.setState({ saveState: "saving" });
  try {
    await Promise.all([saveProject(project), ...ids.filter((id) => masks[id]).map((id) => saveMask(project.id, id, masks[id]))]);
    if (useEditor.getState().saveState === "saving") useEditor.setState({ saveState: "saved" });
    scheduleThumb(project.id);
  } catch (e) {
    console.error("Save failed", e);
    ids.forEach((id) => dirtyMasks.add(id));
    useEditor.setState({ saveState: "pending" });
  }
}

function scheduleThumb(projectId: string) {
  if (thumbTimer) clearTimeout(thumbTimer);
  thumbTimer = setTimeout(async () => {
    const canvas = compositeCanvas;
    if (!canvas || useEditor.getState().project?.id !== projectId) return;
    try {
      await saveThumb(projectId, await canvasThumb(canvas));
    } catch {
      // thumbnails are best effort
    }
  }, 1500);
}

export function useActiveScheme(): Scheme | null {
  return useEditor((s) => (s.project ? activeScheme(s.project) : null));
}

