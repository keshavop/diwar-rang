"use client";

import { Check, Minus, Plus, SquarePlus, Undo, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors",
            value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LabeledSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex min-w-36 flex-1 items-center gap-2.5 text-xs text-muted-foreground sm:max-w-64">
      <span className="shrink-0">{label}</span>
      <Slider
        className="flex-1 py-2"
        min={min}
        max={max}
        value={value}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : (v as number))}
        aria-label={label}
      />
      <span className="w-7 shrink-0 text-right tabular-nums text-foreground">{value}</span>
    </label>
  );
}

export function ToolOptions({ className }: { className?: string }) {
  const tool = useEditor((s) => s.tool);
  const mode = useEditor((s) => s.mode);
  const setMode = useEditor((s) => s.setMode);
  const tolerance = useEditor((s) => s.tolerance);
  const setTolerance = useEditor((s) => s.setTolerance);
  const brushSize = useEditor((s) => s.brushSize);
  const setBrushSize = useEditor((s) => s.setBrushSize);
  const contiguous = useEditor((s) => s.contiguous);
  const setContiguous = useEditor((s) => s.setContiguous);
  const edgeStop = useEditor((s) => s.edgeStop);
  const setEdgeStop = useEditor((s) => s.setEdgeStop);
  const polygon = useEditor((s) => s.polygon);
  const commitPolygon = useEditor((s) => s.commitPolygon);
  const cancelPolygon = useEditor((s) => s.cancelPolygon);
  const undoPolygonPoint = useEditor((s) => s.undoPolygonPoint);
  const activeName = useEditor((s) => s.project?.sections.find((x) => x.id === s.activeSectionId)?.name);
  const setActiveSection = useEditor((s) => s.setActiveSection);

  // Which section the next fill/shape goes into, plus a one-tap way to start a new one.
  const target = (
    <div className="flex shrink-0 items-center gap-1 rounded-lg border py-0.5 pr-0.5 pl-2.5 text-xs">
      <span className="text-muted-foreground">Into</span>
      <span className="max-w-28 truncate font-medium">{activeName ?? "new section"}</span>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        disabled={!activeName}
        onClick={() => setActiveSection(null)}
        aria-label="Put the next selection into a new section"
        title="Next tap starts a new section"
      >
        <SquarePlus data-icon="inline-start" />
        New
      </Button>
    </div>
  );

  const modeToggle = (
    <Segmented
      label="Selection mode"
      value={mode}
      onChange={setMode}
      options={[
        { value: "add", label: "Add", icon: <Plus className="size-3.5" /> },
        { value: "subtract", label: "Remove", icon: <Minus className="size-3.5" /> },
      ]}
    />
  );

  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-3 overflow-x-auto px-3 py-1.5 [scrollbar-width:none]",
        className,
      )}
    >
      {tool === "fill" && (
        <>
          {target}
          {modeToggle}
          <LabeledSlider label="Tolerance" value={tolerance} min={2} max={60} onChange={setTolerance} />
          <Segmented
            label="Fill reach"
            value={contiguous ? "connected" : "all"}
            onChange={(v) => setContiguous(v === "connected")}
            options={[
              { value: "connected", label: "Connected" },
              { value: "all", label: "Everywhere" },
            ]}
          />
          <button
            type="button"
            aria-pressed={edgeStop}
            onClick={() => setEdgeStop(!edgeStop)}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
              edgeStop ? "border-primary bg-accent text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {edgeStop && <Check className="size-3.5" />}
            Stop at edges
          </button>
        </>
      )}

      {tool === "polygon" && (
        <>
          {target}
          {modeToggle}
          <span className="shrink-0 text-xs text-muted-foreground">
            {polygon.length === 0
              ? "Tap corners of the area"
              : polygon.length < 3
                ? `${polygon.length} point${polygon.length > 1 ? "s" : ""}. Add more`
                : "Tap the first point or ✓ to finish"}
          </span>
          <div className="ml-auto flex shrink-0 gap-1">
            <Button variant="outline" size="icon-lg" aria-label="Remove last point" disabled={!polygon.length} onClick={undoPolygonPoint}>
              <Undo />
            </Button>
            <Button variant="outline" size="icon-lg" aria-label="Cancel shape" disabled={!polygon.length} onClick={cancelPolygon}>
              <X />
            </Button>
            <Button size="icon-lg" aria-label="Finish shape" disabled={polygon.length < 3} onClick={commitPolygon}>
              <Check />
            </Button>
          </div>
        </>
      )}

      {(tool === "brush" || tool === "erase") && (
        <>
          <LabeledSlider label="Size" value={brushSize} min={2} max={160} onChange={setBrushSize} />
          <span className="shrink-0 text-xs text-muted-foreground">
            {tool === "brush" ? "Paint to add to" : "Paint to remove from"}{" "}
            <span className="font-medium text-foreground">{activeName ?? (tool === "brush" ? "a new section" : "the selected section")}</span>
          </span>
        </>
      )}

      {tool === "move" && (
        <span className="text-xs text-muted-foreground">Drag to move around. Pinch, scroll, or use + / − to zoom.</span>
      )}
    </div>
  );
}
