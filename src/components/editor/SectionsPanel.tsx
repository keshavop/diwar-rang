"use client";

import { useState } from "react";
import { Eraser, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { SECTION_NAME_IDEAS } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { useActiveScheme, useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { RenameDialog } from "@/components/common/RenameDialog";
import type { Section } from "@/lib/types";

const NO_SECTIONS: Section[] = [];

export function Swatch({ hex, className }: { hex?: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-7 shrink-0 rounded-md ring-1 ring-black/15 ring-inset", className)}
      style={
        hex
          ? { background: hex }
          : { background: "repeating-linear-gradient(45deg, transparent 0 4px, rgb(0 0 0 / 0.12) 4px 6px)" }
      }
    />
  );
}

export function SectionsPanel({ onPickColor }: { onPickColor: () => void }) {
  const sections = useEditor((s) => s.project?.sections ?? NO_SECTIONS);
  const activeId = useEditor((s) => s.activeSectionId);
  const setActive = useEditor((s) => s.setActiveSection);
  const addSection = useEditor((s) => s.addSection);
  const renameSection = useEditor((s) => s.renameSection);
  const deleteSection = useEditor((s) => s.deleteSection);
  const clearSection = useEditor((s) => s.clearSection);
  const setTool = useEditor((s) => s.setTool);
  const scheme = useActiveScheme();

  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const nameOf = (id: string | null) => sections.find((s) => s.id === id)?.name ?? "";
  const unused = SECTION_NAME_IDEAS.filter((n) => !sections.some((s) => s.name === n));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {sections.length ? "Tap a section, then paint or fix it on the photo." : "Each wall, door or trim is a section."}
        </p>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          New
        </Button>
      </div>

      {sections.length === 0 ? (
        <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
          Pick the <span className="font-medium text-foreground">Fill</span> tool and tap a wall on the photo. A section is
          created for you.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sections.map((s) => {
            const color = scheme?.colors[s.id];
            const active = s.id === activeId;
            return (
              <li
                key={s.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-1.5 pr-1 transition-colors",
                  active ? "border-primary bg-accent/60" : "border-transparent bg-muted/50 hover:bg-muted",
                )}
              >
                <button
                  type="button"
                  aria-label={`Change colour of ${s.name}`}
                  onClick={() => {
                    setActive(s.id);
                    onPickColor();
                  }}
                  className="rounded-md focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Swatch hex={color?.hex} className="size-9" />
                </button>
                <button
                  type="button"
                  onClick={() => setActive(active ? null : s.id)}
                  aria-pressed={active}
                  className="flex min-h-10 min-w-0 flex-1 flex-col items-start justify-center text-left"
                >
                  <span className="w-full truncate text-sm font-medium">{s.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {color ? `${color.hex.toUpperCase()} · ${Math.round(color.opacity * 100)}%` : "Not painted in this scheme"}
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label={`Options for ${s.name}`} />}>
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setRenaming(s.id)}>
                      <Pencil />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => {
                        setActive(s.id);
                        setTool("erase");
                      }}
                    >
                      <Eraser />
                      Erase parts
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => clearSection(s.id)}>
                      <Eraser />
                      Clear selection
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onClick={() => setDeleting(s.id)}>
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}

      <RenameDialog
        open={adding}
        onOpenChange={setAdding}
        title="New section"
        initialValue={unused[0] ?? `Section ${sections.length + 1}`}
        submitLabel="Add"
        suggestions={unused}
        onSubmit={(name) => {
          addSection(name);
          setTool("fill");
        }}
      />
      <RenameDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename section"
        initialValue={nameOf(renaming)}
        suggestions={unused}
        onSubmit={(name) => renaming && renameSection(renaming, name)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${nameOf(deleting)}”?`}
        description="Its selection and its colour in every scheme are removed."
        onConfirm={() => deleting && deleteSection(deleting)}
      />
    </div>
  );
}
