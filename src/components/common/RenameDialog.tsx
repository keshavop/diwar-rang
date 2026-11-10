"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label?: string;
  initialValue: string;
  submitLabel?: string;
  suggestions?: string[];
  onSubmit: (value: string) => void;
}

export function RenameDialog({ open, onOpenChange, ...rest }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Remount the form each time it opens so it starts from initialValue. */}
        {open && <RenameForm {...rest} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  title,
  label = "Name",
  initialValue,
  submitLabel = "Save",
  suggestions,
  onSubmit,
  onDone,
}: Omit<Props, "open" | "onOpenChange"> & { onDone: () => void }) {
  const [value, setValue] = useState(initialValue);

  const submit = (v: string) => {
    const name = v.trim();
    if (!name) return;
    onSubmit(name.slice(0, 60));
    onDone();
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="rename-input">{label}</Label>
        <Input
          id="rename-input"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-10 text-base sm:text-sm"
          maxLength={60}
        />
        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="rounded-full border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!value.trim()}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}
