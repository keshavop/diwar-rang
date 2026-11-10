"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { Check, ChevronDown } from "lucide-react";
import { isValidHex, readableOn } from "@/lib/color";
import { PALETTE } from "@/lib/palette";
import { cn } from "@/lib/utils";
import { useActiveScheme, useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Swatch } from "./SectionsPanel";

const RECENT_KEY = "paint-shop:recent-colors";
const SWATCH_NAMES = new Map(PALETTE.flatMap((g) => g.swatches.map((s) => [s.hex.toLowerCase(), s.name] as const)));

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && isValidHex(x)).slice(0, 10) : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // per-viewer convenience only
  }
}

function SwatchButton({ hex, name, selected, onClick }: { hex: string; name?: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={name ? `${name} ${hex}` : hex}
      aria-label={name ?? hex}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "relative aspect-square w-full rounded-lg ring-1 ring-black/15 transition-transform ring-inset hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected && "ring-2 ring-foreground",
      )}
      style={{ background: hex }}
    >
      {selected && <Check className="absolute inset-0 m-auto size-4" style={{ color: readableOn(hex) }} />}
    </button>
  );
}

export function ColorPicker() {
  const activeId = useEditor((s) => s.activeSectionId);
  const section = useEditor((s) => s.project?.sections.find((x) => x.id === s.activeSectionId));
  const setColor = useEditor((s) => s.setSectionColor);
  const setOpacity = useEditor((s) => s.setSectionOpacity);
  const removeColor = useEditor((s) => s.removeSectionColor);
  const scheme = useActiveScheme();
  const current = activeId ? scheme?.colors[activeId] : undefined;

  const [recent, setRecent] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const recentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // localStorage is only available after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate per-viewer preference
    setRecent(readRecent());
  }, []);

  const remember = (hex: string) => {
    if (recentTimer.current) clearTimeout(recentTimer.current);
    recentTimer.current = setTimeout(() => {
      setRecent((list) => {
        const next = [hex.toLowerCase(), ...list.filter((c) => c !== hex.toLowerCase())].slice(0, 10);
        writeRecent(next);
        return next;
      });
    }, 700);
  };

  const apply = (hex: string) => {
    if (!activeId) return;
    setColor(activeId, hex.toLowerCase());
    remember(hex);
  };

  if (!activeId || !section) {
    return (
      <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
        Select a section first. Tap a wall with the <span className="font-medium text-foreground">Fill</span> tool, or pick one in
        Sections.
      </div>
    );
  }

  const hex = current?.hex;
  const hexValue = hexDraft ?? hex ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Swatch hex={hex} className="size-12 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{section.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {hex ? `${SWATCH_NAMES.get(hex) ?? "Custom"} · ${hex.toUpperCase()}` : "Not painted in this scheme"}
          </p>
        </div>
        {hex && (
          <Button variant="ghost" size="sm" onClick={() => removeColor(activeId)}>
            Unpaint
          </Button>
        )}
      </div>

      {current && (
        <label className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="shrink-0">Paint strength</span>
          <Slider
            className="flex-1 py-2"
            min={10}
            max={100}
            value={Math.round(current.opacity * 100)}
            onValueChange={(v) => setOpacity(activeId, (Array.isArray(v) ? v[0] : (v as number)) / 100)}
            aria-label="Paint strength"
          />
          <span className="w-9 text-right tabular-nums text-foreground">{Math.round(current.opacity * 100)}%</span>
        </label>
      )}

      {recent.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Recent</p>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
            {recent.map((c) => (
              <SwatchButton key={c} hex={c} name={SWATCH_NAMES.get(c)} selected={c === hex} onClick={() => apply(c)} />
            ))}
          </div>
        </div>
      )}

      {PALETTE.map((group) => (
        <div key={group.name} className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">{group.name}</p>
          <div className="grid grid-cols-8 gap-1.5">
            {group.swatches.map((s) => (
              <SwatchButton key={s.hex} hex={s.hex} name={s.name} selected={s.hex === hex} onClick={() => apply(s.hex)} />
            ))}
          </div>
        </div>
      ))}

      <div className="rounded-xl border">
        <button
          type="button"
          onClick={() => setCustom((v) => !v)}
          aria-expanded={custom}
          className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium"
        >
          Custom colour
          <ChevronDown className={cn("size-4 transition-transform", custom && "rotate-180")} />
        </button>
        {custom && (
          <div className="flex flex-col gap-3 px-3 pb-3 [&_.react-colorful]:h-44 [&_.react-colorful]:w-full">
            <HexColorPicker color={hex ?? "#cccccc"} onChange={apply} />
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Hex</span>
              <Input
                value={hexValue}
                onChange={(e) => setHexDraft(e.target.value)}
                onBlur={() => {
                  if (hexDraft && isValidHex(hexDraft)) apply(hexDraft.startsWith("#") ? hexDraft : `#${hexDraft}`);
                  setHexDraft(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="h-9 font-mono text-base uppercase sm:text-sm"
                maxLength={7}
                aria-label="Hex colour"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
