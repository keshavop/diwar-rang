"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { Maximize, Minus, Plus } from "lucide-react";
import { dilate } from "@/lib/floodFill";
import { isMaskEmpty, maskOutline, softenMask, type Point } from "@/lib/mask";
import { composite, meanLightness, type PaintLayer } from "@/lib/recolor";
import { registerCompositeCanvas, useEditor } from "@/store/editor";
import { Button } from "@/components/ui/button";

const TAP_SLOP = 8; // css px
const CLOSE_RADIUS = 16; // css px

interface LayerCache {
  version: number;
  soft: Uint8Array | null;
  meanL: number;
}

export function EditorCanvas() {
  const img = useEditor((s) => s.img);
  const tool = useEditor((s) => s.tool);
  const compare = useEditor((s) => s.compare);

  const stageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ReactZoomPanPinchRef>(null);
  const originalRef = useRef<HTMLCanvasElement>(null);
  const compositeRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const uiRef = useRef<HTMLCanvasElement>(null);

  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [split, setSplit] = useState(50);

  // ---- fit image into the stage --------------------------------------------
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = 12;
  const fitScale = img && stage.w > 0 ? Math.min((stage.w - pad * 2) / img.width, (stage.h - pad * 2) / img.height) : 0;
  const dw = img ? Math.max(1, Math.floor(img.width * fitScale)) : 0;
  const dh = img ? Math.max(1, Math.floor(img.height * fitScale)) : 0;
  const ready = !!img && dw > 1 && dh > 1;

  useEffect(() => {
    zoomRef.current?.resetTransform(0);
  }, [stage.w, stage.h]);

  // ---- rendering --------------------------------------------------------
  const cache = useRef(new Map<string, LayerCache>());
  const outBuf = useRef<ImageData | null>(null);
  const overlayKey = useRef("");
  const rafId = useRef(0);
  const hover = useRef<Point | null>(null);
  const displayW = useRef(dw);
  useEffect(() => {
    displayW.current = dw;
  }, [dw]);

  const drawUi = useCallback(() => {
    const canvas = uiRef.current;
    const { img, polygon, tool, brushSize, compare } = useEditor.getState();
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (compare) return;
    const rect = canvas.getBoundingClientRect();
    const k = rect.width > 0 ? img.width / rect.width : 1; // image px per screen px

    if (tool === "polygon" && polygon.length > 0) {
      ctx.lineJoin = "round";
      ctx.beginPath();
      polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      if (hover.current) ctx.lineTo(hover.current.x, hover.current.y);
      ctx.strokeStyle = "rgba(0,0,0,0.55)";
      ctx.lineWidth = 4 * k;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * k;
      ctx.setLineDash([6 * k, 4 * k]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (polygon.length >= 3) {
        ctx.fillStyle = "rgba(56, 189, 248, 0.18)";
        ctx.beginPath();
        polygon.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
      }
      polygon.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, (i === 0 ? 7 : 4.5) * k, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? "#0ea5e9" : "#ffffff";
        ctx.fill();
        ctx.lineWidth = 1.5 * k;
        ctx.strokeStyle = "rgba(0,0,0,0.7)";
        ctx.stroke();
      });
    }

    if ((tool === "brush" || tool === "erase") && hover.current) {
      ctx.beginPath();
      ctx.arc(hover.current.x, hover.current.y, brushSize / 2, 0, Math.PI * 2);
      ctx.lineWidth = 3 * k;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.stroke();
      ctx.lineWidth = 1.5 * k;
      ctx.strokeStyle = tool === "erase" ? "#fca5a5" : "#ffffff";
      ctx.stroke();
    }
  }, []);

  const render = useCallback(() => {
    rafId.current = 0;
    const { img, project, masks, versions, activeSectionId, compare } = useEditor.getState();
    const out = compositeRef.current;
    if (!img || !project || !out) return;
    const scheme = project.schemes.find((s) => s.id === project.activeSchemeId) ?? project.schemes[0];
    const { width: w, height: h } = img;

    // composite
    const layers: PaintLayer[] = [];
    for (const section of project.sections) {
      const mask = masks[section.id];
      if (!mask) continue;
      const version = versions[section.id] ?? 0;
      let c = cache.current.get(section.id);
      if (!c || c.version !== version) {
        c = isMaskEmpty(mask)
          ? { version, soft: null, meanL: 50 }
          : { version, soft: softenMask(mask, w, h), meanL: meanLightness(img.lab, mask) };
        cache.current.set(section.id, c);
      }
      const color = scheme.colors[section.id];
      if (!color || !c.soft) continue;
      layers.push({ mask: c.soft, meanL: c.meanL, hex: color.hex, opacity: color.opacity });
    }
    if (!outBuf.current || outBuf.current.width !== w || outBuf.current.height !== h) {
      outBuf.current = new ImageData(w, h);
    }
    composite(img.rgba, img.lab, layers, outBuf.current.data);
    out.getContext("2d")!.putImageData(outBuf.current, 0, 0);

    // active section outline
    const overlay = overlayRef.current;
    if (overlay) {
      const active = activeSectionId ? masks[activeSectionId] : undefined;
      const hasColor = !!(activeSectionId && scheme.colors[activeSectionId]);
      const key = `${activeSectionId}:${activeSectionId ? versions[activeSectionId] : 0}:${hasColor}:${displayW.current}:${compare}`;
      if (key !== overlayKey.current) {
        overlayKey.current = key;
        const octx = overlay.getContext("2d")!;
        octx.clearRect(0, 0, w, h);
        if (active && !compare && !isMaskEmpty(active)) {
          const thickness = Math.max(0, Math.round(w / Math.max(1, displayW.current) / 1.6));
          let edge = maskOutline(active, w, h);
          if (thickness > 0) edge = dilate(edge, w, h, thickness);
          const data = new ImageData(w, h);
          const d = data.data;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = y * w + x;
              const o = i * 4;
              if (edge[i]) {
                const ant = (((x + y) / Math.max(4, thickness * 4)) | 0) & 1;
                d[o] = ant ? 255 : 14;
                d[o + 1] = ant ? 255 : 165;
                d[o + 2] = ant ? 255 : 233;
                d[o + 3] = 255;
              } else if (!hasColor && active[i] > 127) {
                d[o] = 14;
                d[o + 1] = 165;
                d[o + 2] = 233;
                d[o + 3] = 70;
              }
            }
          }
          octx.putImageData(data, 0, 0);
        }
      }
    }
    drawUi();
  }, [drawUi]);

  const requestRender = useCallback(() => {
    if (!rafId.current) rafId.current = requestAnimationFrame(render);
  }, [render]);

  // Re-render when anything that affects pixels changes.
  useEffect(() => {
    const unsub = useEditor.subscribe((s, prev) => {
      if (
        s.img !== prev.img ||
        s.masks !== prev.masks ||
        s.versions !== prev.versions ||
        s.project !== prev.project ||
        s.activeSectionId !== prev.activeSectionId ||
        s.compare !== prev.compare
      ) {
        requestRender();
      } else if (s.polygon !== prev.polygon || s.tool !== prev.tool || s.brushSize !== prev.brushSize) {
        drawUi();
      }
    });
    return () => {
      unsub();
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    };
  }, [requestRender, drawUi]);

  // New image → reset caches, paint original, register composite for export/thumbnails.
  useEffect(() => {
    if (!img || !ready) return;
    cache.current.clear();
    overlayKey.current = "";
    const orig = originalRef.current;
    if (orig) orig.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height), 0, 0);
    registerCompositeCanvas(compositeRef.current);
    requestRender();
    return () => registerCompositeCanvas(null);
  }, [img, ready, requestRender]);

  useEffect(() => {
    overlayKey.current = "";
    requestRender();
  }, [dw, requestRender]);

  // ---- pointer input ----------------------------------------------------
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ id: number; startX: number; startY: number; moved: boolean; stroking: boolean; cancelled: boolean } | null>(null);

  // Pointers released outside the canvas must not linger as "fingers down".
  useEffect(() => {
    const forget = (e: PointerEvent) => {
      if (gesture.current?.id !== e.pointerId) pointers.current.delete(e.pointerId);
    };
    window.addEventListener("pointerup", forget);
    window.addEventListener("pointercancel", forget);
    return () => {
      window.removeEventListener("pointerup", forget);
      window.removeEventListener("pointercancel", forget);
    };
  }, []);

  const toImage = (e: React.PointerEvent): Point | null => {
    const canvas = uiRef.current;
    const img = useEditor.getState().img;
    if (!canvas || !img) return null;
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * img.width,
      y: ((e.clientY - r.top) / r.height) * img.height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useEditor.getState();
    // A new primary pointer starts a fresh gesture: drop any pointer whose
    // "up" we never saw (e.g. it was released over a closing dialog).
    if (e.isPrimary) pointers.current.clear();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.compare || st.tool === "move") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    if (pointers.current.size > 1) {
      // Second finger → it's a pinch, not a paint gesture.
      if (gesture.current?.stroking) st.cancelStroke();
      if (gesture.current) gesture.current.cancelled = true;
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e);
    if (!p) return;
    gesture.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, stroking: false, cancelled: false };
    if (st.tool === "brush" || st.tool === "erase") {
      gesture.current.stroking = st.beginStroke(p);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = toImage(e);
    hover.current = p;
    const g = gesture.current;
    if (g && g.id === e.pointerId && !g.cancelled) {
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > TAP_SLOP) g.moved = true;
      if (g.stroking && p) {
        // Use coalesced events for smooth strokes on fast devices.
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
        const st = useEditor.getState();
        if (events.length > 1) {
          const canvas = uiRef.current!;
          const r = canvas.getBoundingClientRect();
          const { width, height } = st.img!;
          for (const ce of events) st.strokeTo({ x: ((ce.clientX - r.left) / r.width) * width, y: ((ce.clientY - r.top) / r.height) * height });
        } else {
          st.strokeTo(p);
        }
      }
    }
    const tool = useEditor.getState().tool;
    if (tool === "brush" || tool === "erase" || tool === "polygon") drawUi();
  };

  const finish = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    const st = useEditor.getState();
    if (g.stroking) {
      if (cancelled || g.cancelled) st.cancelStroke();
      else st.endStroke();
      return;
    }
    if (cancelled || g.cancelled || g.moved) return;
    const p = toImage(e);
    if (!p || !st.img) return;
    if (p.x < 0 || p.y < 0 || p.x >= st.img.width || p.y >= st.img.height) return;

    if (st.tool === "fill") {
      st.fillAt(p.x, p.y);
    } else if (st.tool === "polygon") {
      const first = st.polygon[0];
      if (first && st.polygon.length >= 3 && uiRef.current) {
        const r = uiRef.current.getBoundingClientRect();
        const k = r.width / st.img.width;
        if (Math.hypot((p.x - first.x) * k, (p.y - first.y) * k) <= CLOSE_RADIUS) {
          st.commitPolygon();
          return;
        }
      }
      st.addPolygonPoint(p);
    }
  };

  // ---- compare slider -----------------------------------------------------
  const dragSplit = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setSplit(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
  };

  const cursor =
    tool === "move" ? "cursor-grab" : tool === "fill" ? "cursor-crosshair" : tool === "polygon" ? "cursor-crosshair" : "cursor-none";

  return (
    <div ref={stageRef} className="canvas-stage relative size-full overflow-hidden">
      {stage.w > 0 && (
        <TransformWrapper
          ref={zoomRef}
          minScale={1}
          maxScale={10}
          limitToBounds
          centerZoomedOut
          doubleClick={{ disabled: true }}
          panning={{ disabled: tool !== "move" || compare, velocityDisabled: true }}
          pinch={{ step: 5 }}
          wheel={{ step: 0.15 }}
          onTransform={() => drawUi()}
        >
          <TransformComponent
            wrapperStyle={{ width: stage.w, height: stage.h }}
            contentStyle={{ width: stage.w, height: stage.h }}
          >
            <div className="flex size-full items-center justify-center">
              <div className="relative shadow-lg ring-1 ring-black/10" style={{ width: dw, height: dh, visibility: ready ? "visible" : "hidden" }}>
                {img && (
                  <>
                    <canvas ref={originalRef} width={img.width} height={img.height} className="absolute inset-0 size-full" />
                    <canvas
                      ref={compositeRef}
                      width={img.width}
                      height={img.height}
                      className="absolute inset-0 size-full"
                      style={compare ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined}
                    />
                    <canvas
                      ref={overlayRef}
                      width={img.width}
                      height={img.height}
                      className="pointer-events-none absolute inset-0 size-full"
                      style={{ imageRendering: "pixelated" }}
                    />
                    <canvas
                      ref={uiRef}
                      width={img.width}
                      height={img.height}
                      className={`absolute inset-0 size-full touch-none ${compare ? "pointer-events-none" : cursor}`}
                      onPointerDown={onPointerDown}
                      onPointerMove={onPointerMove}
                      onPointerUp={(e) => finish(e, false)}
                      onPointerCancel={(e) => finish(e, true)}
                      onPointerLeave={() => {
                        hover.current = null;
                        drawUi();
                      }}
                    />
                    {compare && (
                      <div
                        className="absolute inset-0 cursor-ew-resize touch-none select-none"
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          dragSplit(e);
                        }}
                        onPointerMove={(e) => e.buttons && dragSplit(e)}
                        role="slider"
                        aria-label="Before and after split"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(split)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "ArrowLeft") setSplit((v) => Math.max(0, v - 5));
                          if (e.key === "ArrowRight") setSplit((v) => Math.min(100, v + 5));
                        }}
                      >
                        <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${split}%` }}>
                          <div className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-semibold text-neutral-700 shadow-md">
                            ⇆
                          </div>
                        </div>
                        <span className="absolute top-2 left-2 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white">Before</span>
                        <span className="absolute top-2 right-2 rounded-md bg-black/55 px-2 py-0.5 text-xs font-medium text-white">After</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </TransformComponent>
        </TransformWrapper>
      )}

      {ready && (
        <div className="absolute right-2 bottom-2 flex flex-col gap-1 rounded-lg bg-background/85 p-1 shadow-sm ring-1 ring-foreground/10 backdrop-blur">
          <Button variant="ghost" size="icon" aria-label="Zoom in" onClick={() => zoomRef.current?.zoomIn(0.5)}>
            <Plus />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Zoom out" onClick={() => zoomRef.current?.zoomOut(0.5)}>
            <Minus />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Fit to screen" onClick={() => zoomRef.current?.resetTransform()}>
            <Maximize />
          </Button>
        </div>
      )}
    </div>
  );
}
