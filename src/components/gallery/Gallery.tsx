"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Home, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { deleteProject, listProjects, saveProject } from "@/lib/db";
import { createProjectFromImage, nameFromFile } from "@/lib/projects";
import type { ProjectDoc } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { RenameDialog } from "@/components/common/RenameDialog";
import { ProjectCard } from "./ProjectCard";
import { UploadDropzone } from "./UploadDropzone";

export function Gallery() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectDoc[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState<ProjectDoc | null>(null);
  const [deleting, setDeleting] = useState<ProjectDoc | null>(null);

  const refresh = useCallback(async () => {
    try {
      setProjects(await listProjects());
    } catch {
      setProjects([]);
      toast.error("Browser storage is unavailable (private mode?). Projects can't be saved.");
    }
  }, []);

  useEffect(() => {
    // Load saved projects from IndexedDB once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async external store read
    refresh();
  }, [refresh]);

  const create = async (blob: Blob, name: string) => {
    setBusy(true);
    try {
      const id = await createProjectFromImage(blob, name);
      router.push(`/editor/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open that image.");
      setBusy(false);
    }
  };

  const trySample = async () => {
    setBusy(true);
    try {
      const res = await fetch("/samples/house.svg");
      await create(await res.blob(), "Sample house");
    } catch {
      toast.error("Could not load the sample.");
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
      <header className="mb-6 flex items-center gap-3 sm:mb-10">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Home className="size-5" />
        </div>
        <div>
          <h1 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">DiwarRang</h1>
          <p className="text-sm text-muted-foreground">Try paint colours on your house before you buy a single can.</p>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr] lg:items-stretch">
        <UploadDropzone busy={busy} onFile={(f) => create(f, nameFromFile(f))} />
        <div className="flex flex-col justify-between gap-4 rounded-2xl border bg-card p-5 sm:p-6">
          <ol className="space-y-3 text-sm">
            {[
              ["Upload", "a photo of the outside of your house or a room wall."],
              ["Tap", "a wall to select it. Fix the edges with the polygon or brush."],
              ["Paint", "each section. Light and shadow from your photo stay real."],
              ["Compare", "colour schemes side by side with a before/after slider."],
            ].map(([b, rest], i) => (
              <li key={b} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium">{b}</span> {rest}
                </span>
              </li>
            ))}
          </ol>
          <Button variant="secondary" className="h-10" disabled={busy} onClick={trySample}>
            <Sparkles data-icon="inline-start" />
            Try with a sample house
          </Button>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Your projects</h2>
          {projects && projects.length > 0 && (
            <span className="text-sm text-muted-foreground">Saved in this browser</span>
          )}
        </div>
        {projects === null ? (
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No projects yet. Upload a photo above to get started.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onRename={() => setRenaming(p)} onDelete={() => setDeleting(p)} />
            ))}
          </div>
        )}
      </section>

      <RenameDialog
        open={!!renaming}
        onOpenChange={(o) => !o && setRenaming(null)}
        title="Rename project"
        initialValue={renaming?.name ?? ""}
        onSubmit={async (name) => {
          if (!renaming) return;
          await saveProject({ ...renaming, name, updatedAt: Date.now() });
          refresh();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.name}”?`}
        description="The photo, sections and colour schemes are removed from this browser. This can't be undone."
        onConfirm={async () => {
          if (!deleting) return;
          await deleteProject(deleting.id);
          toast.success("Project deleted");
          refresh();
        }}
      />
    </main>
  );
}
