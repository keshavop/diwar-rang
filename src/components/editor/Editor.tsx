"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Cloud, Download, Loader2, SplitSquareHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { downloadCanvas } from "@/lib/image";
import { cn } from "@/lib/utils";
import { flushSave, getCompositeCanvas, useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { RenameDialog } from "@/components/common/RenameDialog";
import { EditorCanvas } from "./EditorCanvas";
import { SidePanel, type PanelTab } from "./SidePanel";
import { TOOL_KEYS, Toolbar } from "./Toolbar";
import { ToolOptions } from "./ToolOptions";

function SaveIndicator() {
  const state = useEditor((s) => s.saveState);
  return (
    <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex" aria-live="polite">
      {state === "saved" ? (
        <>
          <Check className="size-3.5" /> Saved on this device
        </>
      ) : (
        <>
          <Cloud className="size-3.5" /> Saving…
        </>
      )}
    </span>
  );
}

export function Editor({ projectId }: { projectId: string }) {
  const status = useEditor((s) => s.status);
  const name = useEditor((s) => s.project?.name ?? "");
  const schemeName = useEditor((s) => s.project?.schemes.find((x) => x.id === s.project?.activeSchemeId)?.name ?? "");
  const compare = useEditor((s) => s.compare);
  const setCompare = useEditor((s) => s.setCompare);
  const renameProject = useEditor((s) => s.renameProject);
  const hasSections = useEditor((s) => (s.project?.sections.length ?? 0) > 0);

  const [tab, setTab] = useState<PanelTab>("sections");
  const [collapsed, setCollapsed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const autoSwitched = useRef(false);

  useEffect(() => {
    useEditor.getState().load(projectId);
    const onHide = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushSave);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flushSave);
      flushSave();
    };
  }, [projectId]);

  // After the very first section is created, show colours so the user can pick one.
  useEffect(() => {
    if (hasSections && !autoSwitched.current && status === "ready") {
      autoSwitched.current = true;
      const sections = useEditor.getState().project?.sections ?? [];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time UX nudge driven by store state
      if (sections.length === 1 && useEditor.getState().undoStack.length > 0) setTab("colors");
    }
  }, [hasSections, status]);

  // Keyboard shortcuts (desktop).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return;
      const st = useEditor.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
        return;
      }
      if (mod || e.altKey) return;
      if (st.tool === "polygon" && st.polygon.length) {
        if (e.key === "Enter") return st.commitPolygon();
        if (e.key === "Escape") return st.cancelPolygon();
        if (e.key === "Backspace") return st.undoPolygonPoint();
      }
      if (e.key === "Escape" && st.compare) return st.setCompare(false);
      const tool = TOOL_KEYS[e.key.toLowerCase()];
      if (tool && !st.compare) st.setTool(tool);
      if (e.key.toLowerCase() === "c") st.setCompare(!st.compare);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const exportPng = async () => {
    const canvas = getCompositeCanvas();
    if (!canvas) return;
    try {
      await downloadCanvas(canvas, `${name || "house"} ${schemeName}`);
    } catch {
      toast.error("Could not export the image.");
    }
  };

  if (status === "missing" || status === "error") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">{status === "missing" ? "Project not found" : "Couldn't open this project"}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {status === "missing"
            ? "It may have been deleted, or it was saved in a different browser. Projects are stored only on the device where you made them."
            : "The photo couldn't be loaded from this browser's storage."}
        </p>
        <Button nativeButton={false} render={<Link href="/" />}>Back to projects</Button>
      </main>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
        <Button variant="ghost" size="icon-lg" aria-label="Back to projects" nativeButton={false} render={<Link href="/" />}>
          <ArrowLeft />
        </Button>
        <button
          type="button"
          onClick={() => setRenaming(true)}
          className="min-w-0 flex-1 truncate rounded-md px-1 text-left hover:bg-muted sm:flex-none"
          title="Rename project"
        >
          <span className="block truncate text-sm font-semibold sm:text-base">{name || "Loading…"}</span>
          <span className="block truncate text-xs text-muted-foreground">{schemeName}</span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <SaveIndicator />
          <Button
            variant={compare ? "default" : "outline"}
            className="h-10"
            disabled={status !== "ready"}
            onClick={() => setCompare(!compare)}
            aria-pressed={compare}
          >
            {compare ? <X data-icon="inline-start" /> : <SplitSquareHorizontal data-icon="inline-start" />}
            <span className="hidden min-[400px]:inline">{compare ? "Done" : "Compare"}</span>
          </Button>
          <Button variant="outline" size="icon-lg" className="size-10" aria-label="Download image" disabled={status !== "ready"} onClick={exportPng}>
            <Download />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <Toolbar
          className={cn(
            "order-3 shrink-0 border-t lg:order-1 lg:border-t-0 lg:border-r",
            compare && "hidden lg:flex lg:pointer-events-none lg:opacity-40",
          )}
        />
        <div className="order-1 flex min-h-0 flex-1 flex-col lg:order-2">
          <ToolOptions className={cn("shrink-0 border-b bg-background", compare && "hidden")} />
          {compare && (
            <div className="flex min-h-12 shrink-0 items-center border-b px-3 text-xs text-muted-foreground">
              Drag the handle across the photo to compare before and after. Switch schemes in the panel.
            </div>
          )}
          <div className="relative min-h-0 flex-1">
            {status === "loading" ? (
              <div className="canvas-stage flex size-full items-center justify-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <EditorCanvas />
            )}
          </div>
        </div>
        <SidePanel
          tab={tab}
          onTabChange={setTab}
          collapsed={collapsed}
          onCollapsedChange={setCollapsed}
          className={cn(
            "order-4 shrink-0 border-t lg:order-3 lg:h-auto lg:w-[340px] lg:border-t-0 lg:border-l xl:w-[380px]",
            collapsed ? "h-auto" : "h-[40dvh] max-h-[420px] lg:max-h-none",
          )}
        />
      </div>

      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        title="Rename project"
        initialValue={name}
        onSubmit={renameProject}
      />
    </div>
  );
}
