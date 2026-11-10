"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { getThumb } from "@/lib/db";
import type { ProjectDoc } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props {
  project: ProjectDoc;
  onRename: () => void;
  onDelete: () => void;
}

function useThumbUrl(id: string, version: number) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    getThumb(id).then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, version]);
  return url;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function ProjectCard({ project, onRename, onDelete }: Props) {
  const thumb = useThumbUrl(project.id, project.updatedAt);
  const painted = project.sections.length;

  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md">
      <Link href={`/editor/${project.id}`} className="block focus-visible:outline-2 focus-visible:outline-ring">
        <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob URL
            <img src={thumb} alt="" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
          ) : (
            <div className="size-full animate-pulse" />
          )}
        </div>
        <div className="space-y-0.5 p-3 pr-12">
          <p className="truncate font-medium">{project.name}</p>
          <p className="text-xs text-muted-foreground">
            {painted} {painted === 1 ? "section" : "sections"} · {project.schemes.length}{" "}
            {project.schemes.length === 1 ? "scheme" : "schemes"} · {dateFmt.format(project.updatedAt)}
          </p>
        </div>
      </Link>
      <div className="absolute right-2 bottom-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label={`Options for ${project.name}`} />}>
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={onRename}>
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
