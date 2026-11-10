"use client";

import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  busy: boolean;
  onFile: (file: File) => void;
}

export function UploadDropzone({ busy, onFile }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files);
      }}
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors sm:py-14",
        dragging ? "border-primary bg-accent" : "border-border",
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
        {busy ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
      </div>
      <div className="space-y-1">
        <p className="text-base font-medium">{busy ? "Preparing your photo…" : "Add a photo of your house or wall"}</p>
        <p className="text-sm text-muted-foreground">
          <span className="hidden sm:inline">Drag it here, or choose a file. </span>
          JPG, PNG or WebP. Stays on this device.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button size="lg" className="h-11 px-5" disabled={busy} onClick={() => fileRef.current?.click()}>
          <ImagePlus data-icon="inline-start" />
          Choose photo
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="h-11 px-5 sm:hidden"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera data-icon="inline-start" />
          Take a photo
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
