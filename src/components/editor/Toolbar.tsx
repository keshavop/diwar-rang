"use client";

import { Brush, Eraser, Hand, PaintBucket, Pentagon, Redo2, Undo2 } from "lucide-react";
import type { Tool } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const TOOLS: { id: Tool; label: string; hint: string; key: string; icon: typeof Brush }[] = [
  { id: "fill", label: "Fill", hint: "Tap an area to select similar colour", key: "F", icon: PaintBucket },
  { id: "polygon", label: "Shape", hint: "Tap points to outline a section", key: "P", icon: Pentagon },
  { id: "brush", label: "Brush", hint: "Paint to add to the section", key: "B", icon: Brush },
  { id: "erase", label: "Erase", hint: "Paint to remove from the section", key: "E", icon: Eraser },
  { id: "move", label: "Move", hint: "Drag to pan. Pinch or scroll to zoom", key: "M", icon: Hand },
];

export function Toolbar({ className }: { className?: string }) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const canUndo = useEditor((s) => s.undoStack.length > 0);
  const canRedo = useEditor((s) => s.redoStack.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);

  return (
    <div
      role="toolbar"
      aria-label="Tools"
      className={cn("flex items-center gap-1 px-2 py-1.5 lg:flex-col lg:px-1.5 lg:py-3", className)}
    >
      <div className="flex flex-1 items-center justify-between gap-0.5 lg:flex-none lg:flex-col lg:justify-start lg:gap-1">
        {TOOLS.map((t) => {
          const active = tool === t.id;
          return (
            <Tooltip key={t.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTool(t.id)}
                    className={cn(
                      "flex h-12 min-w-12 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-medium transition-colors lg:h-14 lg:w-14 lg:flex-none",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  />
                }
              >
                <t.icon className="size-5" />
                {t.label}
              </TooltipTrigger>
              <TooltipContent side="right">
                {t.hint} <kbd className="ml-1 opacity-70">{t.key}</kbd>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="mx-1 h-8 w-px bg-border lg:mx-0 lg:my-1 lg:h-px lg:w-8" />
      <div className="flex items-center gap-0.5 lg:flex-col lg:gap-1">
        <Button variant="ghost" size="icon-lg" className="size-11" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <Undo2 className="size-5" />
        </Button>
        <Button variant="ghost" size="icon-lg" className="size-11" aria-label="Redo" disabled={!canRedo} onClick={redo}>
          <Redo2 className="size-5" />
        </Button>
      </div>
    </div>
  );
}

export const TOOL_KEYS: Record<string, Tool> = { f: "fill", p: "polygon", b: "brush", e: "erase", m: "move" };
