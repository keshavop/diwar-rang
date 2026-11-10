"use client";

import { useState } from "react";
import { Check, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditor } from "@/store/editor";
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

const SCHEME_IDEAS = ["Warm neutrals", "Classic white", "Navy & white", "Earthy", "Bold accent", "Sage & cream"];

export function SchemeSwitcher() {
  const project = useEditor((s) => s.project);
  const setActive = useEditor((s) => s.setActiveScheme);
  const addScheme = useEditor((s) => s.addScheme);
  const renameScheme = useEditor((s) => s.renameScheme);
  const deleteScheme = useEditor((s) => s.deleteScheme);

  const [creating, setCreating] = useState<null | "copy" | "blank">(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  if (!project) return null;

  const nameOf = (id: string | null) => project.schemes.find((s) => s.id === id)?.name ?? "";
  const unused = SCHEME_IDEAS.filter((n) => !project.schemes.some((s) => s.name === n));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        A scheme is a set of colours for your sections. Make a few and switch between them to compare.
      </p>
      <ul className="flex flex-col gap-1.5">
        {project.schemes.map((scheme) => {
          const active = scheme.id === project.activeSchemeId;
          const colors = project.sections.map((s) => scheme.colors[s.id]?.hex).filter(Boolean) as string[];
          return (
            <li
              key={scheme.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border p-1.5 pl-3 transition-colors",
                active ? "border-primary bg-accent/60" : "border-transparent bg-muted/50 hover:bg-muted",
              )}
            >
              <button
                type="button"
                onClick={() => setActive(scheme.id)}
                aria-pressed={active}
                className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center gap-1 text-left"
              >
                <span className="flex w-full items-center gap-1.5 truncate text-sm font-medium">
                  {active && <Check className="size-3.5 shrink-0 text-primary" />}
                  {scheme.name}
                </span>
                <span className="flex h-3.5 w-full max-w-48 overflow-hidden rounded-full ring-1 ring-black/10">
                  {colors.length ? (
                    colors.map((c, i) => <span key={i} className="h-full flex-1" style={{ background: c }} />)
                  ) : (
                    <span className="h-full flex-1 bg-muted" />
                  )}
                </span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-lg" aria-label={`Options for ${scheme.name}`} />}>
                  <MoreHorizontal />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => setRenaming(scheme.id)}>
                    <Pencil />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setActive(scheme.id);
                      setCreating("copy");
                    }}
                  >
                    <Copy />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    disabled={project.schemes.length <= 1}
                    onClick={() => setDeleting(scheme.id)}
                  >
                    <Trash2 />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-10" onClick={() => setCreating("copy")}>
          <Copy data-icon="inline-start" />
          Copy current
        </Button>
        <Button variant="outline" className="h-10" onClick={() => setCreating("blank")}>
          <Plus data-icon="inline-start" />
          Blank scheme
        </Button>
      </div>

      <RenameDialog
        open={!!creating}
        onOpenChange={(o) => !o && setCreating(null)}
        title={creating === "copy" ? "Copy scheme" : "New scheme"}
        initialValue={unused[0] ?? `Scheme ${project.schemes.length + 1}`}
        submitLabel="Create"
        suggestions={unused}
        onSubmit={(name) => addScheme(name, creating === "copy")}
      />
      <RenameDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename scheme"
        initialValue={nameOf(renaming)}
        onSubmit={(name) => renaming && renameScheme(renaming, name)}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${nameOf(deleting)}”?`}
        description="The colours in this scheme are removed. Your sections stay."
        onConfirm={() => deleting && deleteScheme(deleting)}
      />
    </div>
  );
}
