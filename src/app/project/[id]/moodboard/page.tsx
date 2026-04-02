"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { MoodboardItem, MoodboardItemKind, MoodboardShapeVariant } from "@/domain/models";
import {
  angleFromCenter,
  localTopLeftToCanvas,
  nwCanvasFromItem,
  rotateVec,
  topLeftFromFixedNE,
  topLeftFromFixedNW,
  topLeftFromFixedSE,
  topLeftFromFixedSW,
} from "@/domain/moodboardTransforms";
import {
  createMoodboardItem,
  deleteMoodboardItem,
  listMoodboardItems,
  nextMoodboardZIndex,
  updateMoodboardItem,
} from "@/db/repos/moodboard";
import {
  isLineLike,
  lineBBox,
  MOODBOARD_DRAG_PREFIX,
  MoodboardCanvasItem,
  type MoodboardGripMode,
  shapeVariantFromText,
} from "./MoodboardCanvasItem";

const CANVAS_W = 3400;
const CANVAS_H = 2600;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

type GripState = {
  pointerId: number;
  mode: MoodboardGripMode;
  itemId: string;
  startItem: MoodboardItem;
  startMx: number;
  startMy: number;
  startAngle?: number;
  startRot?: number;
  shiftKey: boolean;
  groupIds?: string[];
  startGroupItems?: Record<string, MoodboardItem>;
  groupCenter?: { gcx: number; gcy: number };
};

function clientToCanvas(clientX: number, clientY: number, el: HTMLElement | null): { x: number; y: number } {
  if (!el) return { x: 0, y: 0 };
  const r = el.getBoundingClientRect();
  return {
    x: ((clientX - r.left) / r.width) * CANVAS_W,
    y: ((clientY - r.top) / r.height) * CANVAS_H,
  };
}

function stackPos(index: number) {
  const n = index % 7;
  return { x: 80 + n * 48, y: 80 + n * 36 + Math.floor(index / 7) * 72 };
}

function layoutForBoxHandles(item: MoodboardItem): MoodboardItem {
  if (isLineLike(item)) {
    const b = lineBBox(item);
    return { ...item, x: b.left, y: b.top, width: b.w, height: b.h };
  }
  return item;
}

function resizeAxesDelta(dCanvasX: number, dCanvasY: number, rotationDeg: number) {
  const ux = rotateVec(1, 0, rotationDeg);
  const uy = rotateVec(0, 1, rotationDeg);
  const dw = dCanvasX * ux.x + dCanvasY * ux.y;
  const dh = dCanvasX * uy.x + dCanvasY * uy.y;
  return { dw, dh };
}

function acceptsImageDrop(e: React.DragEvent) {
  const types = e.dataTransfer.types;
  return (
    types.includes("Files") ||
    types.includes("text/uri-list") ||
    types.includes("text/plain")
  );
}

function imageFilesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = [];
  for (let i = 0; i < dt.files.length; i++) {
    const f = dt.files[i];
    if (f.type.startsWith("image/")) out.push(f);
  }
  return out;
}

function capImageDimensions(nw: number, nh: number, maxSide = 480): { w: number; h: number } {
  const m = Math.max(nw, nh, 1);
  const s = Math.min(1, maxSide / m);
  return { w: Math.max(40, Math.round(nw * s)), h: Math.max(40, Math.round(nh * s)) };
}

async function fileToImageItemPayload(file: File): Promise<{ url: string; w: number; h: number }> {
  const url = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  const { w, h } = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new window.Image();
    img.onload = () => resolve(capImageDimensions(img.naturalWidth, img.naturalHeight));
    img.onerror = () => resolve({ w: 280, h: 200 });
    img.src = url;
  });
  return { url, w, h };
}

function defaultSize(kind: MoodboardItemKind): { w: number; h: number } {
  switch (kind) {
    case "text":
      return { w: 260, h: 120 };
    case "image":
      return { w: 280, h: 200 };
    case "color":
      return { w: 100, h: 100 };
    case "link":
      return { w: 240, h: 88 };
    case "video":
      return { w: 384, h: 216 };
    case "arrow":
      return { w: 200, h: 100 };
    case "shape":
      return { w: 180, h: 120 };
    default:
      return { w: 120, h: 80 };
  }
}

function groupCenterFromItems(list: MoodboardItem[]): { gcx: number; gcy: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const it of list) {
    const L = layoutForBoxHandles(it);
    minX = Math.min(minX, L.x);
    minY = Math.min(minY, L.y);
    maxX = Math.max(maxX, L.x + L.width);
    maxY = Math.max(maxY, L.y + L.height);
  }
  if (!Number.isFinite(minX)) return { gcx: 0, gcy: 0 };
  return { gcx: (minX + maxX) / 2, gcy: (minY + maxY) / 2 };
}

function scaleItemAroundGroupCenter(
  it: MoodboardItem,
  f: number,
  gcx: number,
  gcy: number,
): { x: number; y: number; width: number; height: number } {
  if (isLineLike(it)) {
    const x0 = it.x;
    const y0 = it.y;
    const x1 = it.x + it.width;
    const y1 = it.y + it.height;
    const nx0 = gcx + (x0 - gcx) * f;
    const ny0 = gcy + (y0 - gcy) * f;
    const nx1 = gcx + (x1 - gcx) * f;
    const ny1 = gcy + (y1 - gcy) * f;
    return { x: nx0, y: ny0, width: nx1 - nx0, height: ny1 - ny0 };
  }
  const L = layoutForBoxHandles(it);
  const icx = L.x + L.width / 2;
  const icy = L.y + L.height / 2;
  const nW = Math.max(16, L.width * f);
  const nH = Math.max(16, L.height * f);
  return {
    x: gcx + (icx - gcx) * f - nW / 2,
    y: gcy + (icy - gcy) * f - nH / 2,
    width: nW,
    height: nH,
  };
}

function itemCanvasBBox(it: MoodboardItem) {
  if (isLineLike(it)) {
    const b = lineBBox(it);
    return { left: b.left, top: b.top, right: b.left + b.w, bottom: b.top + b.h };
  }
  const L = layoutForBoxHandles(it);
  return { left: L.x, top: L.y, right: L.x + L.width, bottom: L.y + L.height };
}

function itemIntersectsRect(it: MoodboardItem, L: number, T: number, R: number, B: number) {
  const b = itemCanvasBBox(it);
  return !(b.right < L || b.left > R || b.bottom < T || b.top > B);
}

function snapImageResizePatch(
  mode: MoodboardGripMode,
  L0: MoodboardItem,
  patch: { x: number; y: number; width: number; height: number },
  w0: number,
  h0: number,
  rot: number,
): { x: number; y: number; width: number; height: number } {
  if (L0.kind !== "image" || w0 < 4 || h0 < 4) return patch;
  const nw = Math.max(16, patch.width);
  const nh = Math.max(16, nw / (w0 / h0));
  if (mode === "resize-se") {
    const nw0 = nwCanvasFromItem(L0);
    const tl = topLeftFromFixedNW(nw0, nw, nh, rot);
    return { x: tl.x, y: tl.y, width: nw, height: nh };
  }
  if (mode === "resize-nw") {
    const se0 = localTopLeftToCanvas(w0, h0, L0);
    const tl = topLeftFromFixedSE(se0, nw, nh, rot);
    return { x: tl.x, y: tl.y, width: nw, height: nh };
  }
  if (mode === "resize-ne") {
    const sw0 = localTopLeftToCanvas(0, h0, L0);
    const tl = topLeftFromFixedSW(sw0, nw, nh, rot);
    return { x: tl.x, y: tl.y, width: nw, height: nh };
  }
  if (mode === "resize-sw") {
    const ne0 = localTopLeftToCanvas(w0, 0, L0);
    const tl = topLeftFromFixedNE(ne0, nw, nh, rot);
    return { x: tl.x, y: tl.y, width: nw, height: nh };
  }
  return patch;
}

export default function MoodboardPage() {
  const params = useParams();
  const projectId = typeof params.id === "string" ? params.id : null;
  const [items, setItems] = useState<MoodboardItem[]>([]);
  const [zoom, setZoom] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [grip, setGrip] = useState<GripState | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const canvasInnerRef = useRef<HTMLDivElement | null>(null);
  const itemsRef = useRef(items);
  const selectedIdsRef = useRef(selectedIds);
  itemsRef.current = items;
  selectedIdsRef.current = selectedIds;

  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(
    null,
  );
  const marqueeSessionRef = useRef<{ cx: number; cy: number; pointerId: number } | null>(null);
  const marqueeRectRef = useRef<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  /** Live translate (screen px) for non-leader items during multi-drag; leader uses useDraggable transform. */
  const [multiDragVisual, setMultiDragVisual] = useState<{
    activeId: string;
    followerIds: string[];
    delta: { x: number; y: number };
  } | null>(null);

  const selectItem = useCallback((id: string, e: React.PointerEvent) => {
    const additive = e.ctrlKey || e.metaKey;
    setSelectedIds((prev) => {
      if (additive) {
        if (prev.includes(id)) return prev.filter((x) => x !== id);
        return [...prev, id];
      }
      if (prev.includes(id) && prev.length > 1) {
        return prev;
      }
      return [id];
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  /** Draggables live inside a div with CSS scale(zoom); dnd-kit deltas are screen px — convert to pre-scale layout px. */
  const canvasScaleModifier = useMemo<Modifier>(
    () => (args) => {
      const z = zoom;
      if (!z || z === 1) return args.transform;
      return {
        ...args.transform,
        x: args.transform.x / z,
        y: args.transform.y / z,
      };
    },
    [zoom],
  );

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const list = await listMoodboardItems(projectId);
      if (!cancelled) setItems(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const applyPatchLive = useCallback((id: string, patch: Partial<MoodboardItem>) => {
    void updateMoodboardItem(id, patch);
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i)),
    );
  }, []);

  useEffect(() => {
    if (!grip) return;
    const el = canvasInnerRef.current;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== grip.pointerId || !el) return;
      const { x: mx, y: my } = clientToCanvas(e.clientX, e.clientY, el);
      const dCx = mx - grip.startMx;
      const dCy = my - grip.startMy;
      const cur = itemsRef.current.find((i) => i.id === grip.itemId);
      if (!cur) return;

      const L0 = layoutForBoxHandles(grip.startItem);
      const w0 = L0.width;
      const h0 = L0.height;
      const rot = L0.rotationDeg;

      if (grip.mode === "line-a" || grip.mode === "line-b") {
        const s = grip.startItem;
        const endpointNorm = isLineLike(s) ? { rotationDeg: 0, scale: 1 } : {};
        if (grip.mode === "line-a") {
          const ox = s.x + s.width;
          const oy = s.y + s.height;
          applyPatchLive(grip.itemId, {
            x: mx,
            y: my,
            width: ox - mx,
            height: oy - my,
            ...endpointNorm,
          });
        } else {
          const ox = s.x;
          const oy = s.y;
          applyPatchLive(grip.itemId, {
            x: ox,
            y: oy,
            width: mx - ox,
            height: my - oy,
            ...endpointNorm,
          });
        }
        return;
      }

      if (grip.mode === "rotate") {
        const cx = L0.x + L0.width / 2;
        const cy = L0.y + L0.height / 2;
        const a = angleFromCenter(cx, cy, mx, my);
        const nextRot = (grip.startRot ?? 0) + (a - (grip.startAngle ?? 0));
        applyPatchLive(grip.itemId, { rotationDeg: nextRot });
        return;
      }

      const { dw, dh } = resizeAxesDelta(dCx, dCy, rot);
      let patch: Partial<MoodboardItem> = {};

      if (grip.mode === "resize-se") {
        let newW = Math.max(16, w0 + dw);
        let newH = Math.max(16, h0 + dh);
        if (grip.shiftKey) {
          const f = Math.max(newW / w0, newH / h0);
          newW = Math.max(16, w0 * f);
          newH = Math.max(16, h0 * f);
        }
        const nw0 = nwCanvasFromItem(L0);
        const tl = topLeftFromFixedNW(nw0, newW, newH, rot);
        patch = { x: tl.x, y: tl.y, width: newW, height: newH };
      } else if (grip.mode === "resize-nw") {
        let newW = Math.max(16, w0 - dw);
        let newH = Math.max(16, h0 - dh);
        if (grip.shiftKey) {
          const f = Math.max(newW / w0, newH / h0);
          newW = Math.max(16, w0 * f);
          newH = Math.max(16, h0 * f);
        }
        const se0 = localTopLeftToCanvas(w0, h0, L0);
        const tl = topLeftFromFixedSE(se0, newW, newH, rot);
        patch = { x: tl.x, y: tl.y, width: newW, height: newH };
      } else if (grip.mode === "resize-ne") {
        let newW = Math.max(16, w0 + dw);
        let newH = Math.max(16, h0 - dh);
        if (grip.shiftKey) {
          const f = Math.max(newW / w0, newH / h0);
          newW = Math.max(16, w0 * f);
          newH = Math.max(16, h0 * f);
        }
        const sw0 = localTopLeftToCanvas(0, h0, L0);
        const tl = topLeftFromFixedSW(sw0, newW, newH, rot);
        patch = { x: tl.x, y: tl.y, width: newW, height: newH };
      } else if (grip.mode === "resize-sw") {
        let newW = Math.max(16, w0 - dw);
        let newH = Math.max(16, h0 + dh);
        if (grip.shiftKey) {
          const f = Math.max(newW / w0, newH / h0);
          newW = Math.max(16, w0 * f);
          newH = Math.max(16, h0 * f);
        }
        const ne0 = localTopLeftToCanvas(w0, 0, L0);
        const tl = topLeftFromFixedNE(ne0, newW, newH, rot);
        patch = { x: tl.x, y: tl.y, width: newW, height: newH };
      }

      const g = grip.groupIds;
      const gc = grip.groupCenter;
      const sg = grip.startGroupItems;
      if (g && g.length > 1 && gc && sg && patch.width != null && patch.x != null) {
        let p = patch as { x: number; y: number; width: number; height: number };
        if (grip.startItem.kind === "image") {
          p = snapImageResizePatch(grip.mode, L0, p, w0, h0, rot);
        }
        const f = p.width / Math.max(16, w0);
        for (const gid of g) {
          const it0 = sg[gid];
          if (!it0) continue;
          const next = scaleItemAroundGroupCenter(it0, f, gc.gcx, gc.gcy);
          applyPatchLive(gid, next);
        }
        return;
      }

      if (grip.startItem.kind === "image" && patch.width != null && patch.height != null && patch.x != null) {
        const p = patch as { x: number; y: number; width: number; height: number };
        const fixed = snapImageResizePatch(grip.mode, L0, p, w0, h0, rot);
        applyPatchLive(grip.itemId, fixed);
        return;
      }

      applyPatchLive(grip.itemId, patch);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== grip.pointerId) return;
      setGrip(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [grip, applyPatchLive]);

  const onPatch = useCallback(async (id: string, patch: Partial<MoodboardItem>) => {
    await updateMoodboardItem(id, patch);
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i)),
    );
  }, []);

  const onDelete = useCallback(async (id: string) => {
    await deleteMoodboardItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const beginGrip = useCallback((item: MoodboardItem, mode: MoodboardGripMode, e: React.PointerEvent) => {
    if (item.locked) return;
    const el = canvasInnerRef.current;
    const { x: mx, y: my } = clientToCanvas(e.clientX, e.clientY, el);
    const L = layoutForBoxHandles(item);
    const cx = L.x + L.width / 2;
    const cy = L.y + L.height / 2;

    const sel = selectedIdsRef.current;
    const resizeGroup =
      sel.length > 1 &&
      sel.includes(item.id) &&
      (mode === "resize-se" ||
        mode === "resize-nw" ||
        mode === "resize-ne" ||
        mode === "resize-sw");
    let groupIds: string[] | undefined;
    let startGroupItems: Record<string, MoodboardItem> | undefined;
    let groupCenter: { gcx: number; gcy: number } | undefined;
    if (resizeGroup) {
      groupIds = sel.filter((id) => {
        const it = itemsRef.current.find((i) => i.id === id);
        return it && !it.locked;
      });
      if (groupIds.length > 1) {
        startGroupItems = {};
        for (const gid of groupIds) {
          const it = itemsRef.current.find((i) => i.id === gid);
          if (it) startGroupItems[gid] = { ...it };
        }
        groupCenter = groupCenterFromItems(Object.values(startGroupItems));
      } else {
        groupIds = undefined;
      }
    }

    setGrip({
      pointerId: e.pointerId,
      mode,
      itemId: item.id,
      startItem: { ...item },
      startMx: mx,
      startMy: my,
      shiftKey: e.shiftKey,
      groupIds,
      startGroupItems,
      groupCenter,
      ...(mode === "rotate"
        ? { startAngle: angleFromCenter(cx, cy, mx, my), startRot: item.rotationDeg }
        : {}),
    });
  }, []);

  const onDragZBoostMany = useCallback(
    async (ids: string[]) => {
      if (!projectId || ids.length === 0) return;
      const updates: { id: string; z: number }[] = [];
      for (const id of ids) {
        const z = await nextMoodboardZIndex(projectId);
        updates.push({ id, z });
        await updateMoodboardItem(id, { zIndex: z });
      }
      const zById = Object.fromEntries(updates.map((u) => [u.id, u.z]));
      setItems((prev) =>
        prev.map((i) => (zById[i.id] != null ? { ...i, zIndex: zById[i.id]! } : i)),
      );
    },
    [projectId],
  );

  const resolveMoveIds = useCallback((itemId: string) => {
    const sel = selectedIdsRef.current;
    const list = itemsRef.current;
    if (sel.includes(itemId) && sel.length > 1) {
      return sel.filter((id) => {
        const it = list.find((i) => i.id === id);
        return it && !it.locked;
      });
    }
    return [itemId];
  }, []);

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      const sid = String(e.active.id);
      if (!sid.startsWith(MOODBOARD_DRAG_PREFIX)) return;
      const itemId = sid.slice(MOODBOARD_DRAG_PREFIX.length);
      const moveIds = resolveMoveIds(itemId);
      void onDragZBoostMany(moveIds);
      if (moveIds.length > 1) {
        setMultiDragVisual({
          activeId: itemId,
          followerIds: moveIds.filter((id) => id !== itemId),
          delta: { x: 0, y: 0 },
        });
      } else {
        setMultiDragVisual(null);
      }
    },
    [onDragZBoostMany, resolveMoveIds],
  );

  const onDragMove = useCallback((e: DragMoveEvent) => {
    const sid = String(e.active.id);
    if (!sid.startsWith(MOODBOARD_DRAG_PREFIX)) return;
    const itemId = sid.slice(MOODBOARD_DRAG_PREFIX.length);
    const d = e.delta;
    setMultiDragVisual((prev) => {
      if (!prev || prev.activeId !== itemId) return prev;
      if (prev.delta.x === d.x && prev.delta.y === d.y) return prev;
      return { ...prev, delta: { x: d.x, y: d.y } };
    });
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const sid = String(e.active.id);
      if (!sid.startsWith(MOODBOARD_DRAG_PREFIX)) {
        setMultiDragVisual(null);
        return;
      }
      const itemId = sid.slice(MOODBOARD_DRAG_PREFIX.length);
      const { x: dx, y: dy } = e.delta;
      const moveIds = resolveMoveIds(itemId);
      setMultiDragVisual(null);
      if (dx === 0 && dy === 0) return;
      // delta is already in canvas layout px (after canvasScaleModifier)
      const rdx = dx;
      const rdy = dy;
      setItems((prev) => {
        let next = prev;
        for (const id of moveIds) {
          const item = next.find((i) => i.id === id);
          if (!item) continue;
          const nx = Math.round(item.x + rdx);
          const ny = Math.round(item.y + rdy);
          void updateMoodboardItem(id, { x: nx, y: ny });
          next = next.map((i) => (i.id === id ? { ...i, x: nx, y: ny } : i));
        }
        return next;
      });
    },
    [resolveMoveIds],
  );

  const onDragCancel = useCallback((_e: DragCancelEvent) => {
    setMultiDragVisual(null);
  }, []);

  async function addKind(kind: MoodboardItemKind, shapeVariant?: MoodboardShapeVariant) {
    if (!projectId) return;
    const z = await nextMoodboardZIndex(projectId);
    const { w, h } = defaultSize(kind);
    const pos = stackPos(items.length);
    const base: Omit<MoodboardItem, "id" | "createdAt" | "updatedAt"> = {
      projectId,
      kind,
      x: pos.x,
      y: pos.y,
      width: w,
      height: h,
      zIndex: z,
      text: kind === "shape" ? (shapeVariant ?? "rect") : "",
      url: "",
      color:
        kind === "color"
          ? "#14b8a6"
          : kind === "arrow"
            ? "#334155"
            : kind === "shape"
              ? shapeVariant === "line"
                ? ""
                : "rgba(99,102,241,0.25)"
              : "",
      strokeColor:
        kind === "arrow" || kind === "shape"
          ? shapeVariant === "line" || kind === "arrow"
            ? "#475569"
            : "#6366f1"
          : "",
      strokeWidth: kind === "arrow" || kind === "shape" ? 3 : 2,
      rotationDeg: 0,
      scale: 1,
      locked: false,
    };
    if (kind === "text") base.text = "…";
    if (kind === "link") {
      base.text = "Enlace";
      base.url = "https://";
    }
    if (kind === "shape" && shapeVariant === "line") {
      base.width = 200;
      base.height = 0;
    }
    if (kind === "arrow") {
      base.color = base.strokeColor;
    }
    const row = await createMoodboardItem(base);
    setItems((prev) => [...prev, row]);
    setSelectedIds([row.id]);
  }

  const addImageAtCanvas = useCallback(
    async (opts: {
      url: string;
      width: number;
      height: number;
      canvasX: number;
      canvasY: number;
      offsetIndex: number;
    }) => {
      if (!projectId) return;
      const z = await nextMoodboardZIndex(projectId);
      const ox = opts.offsetIndex * 24;
      const oy = opts.offsetIndex * 24;
      let x = Math.round(opts.canvasX - opts.width / 2 + ox);
      let y = Math.round(opts.canvasY - opts.height / 2 + oy);
      x = Math.max(0, Math.min(CANVAS_W - opts.width, x));
      y = Math.max(0, Math.min(CANVAS_H - opts.height, y));
      const base: Omit<MoodboardItem, "id" | "createdAt" | "updatedAt"> = {
        projectId,
        kind: "image",
        x,
        y,
        width: opts.width,
        height: opts.height,
        zIndex: z,
        text: "",
        url: opts.url,
        color: "",
        strokeColor: "",
        strokeWidth: 2,
        rotationDeg: 0,
        scale: 1,
        locked: false,
      };
      const row = await createMoodboardItem(base);
      setItems((prev) => [...prev, row]);
      setSelectedIds([row.id]);
    },
    [projectId],
  );

  const onCanvasFileDragEnter = useCallback((e: React.DragEvent) => {
    if (!acceptsImageDrop(e)) return;
    e.preventDefault();
    e.stopPropagation();
    setFileDragOver(true);
  }, []);

  const onCanvasFileDragLeave = useCallback((e: React.DragEvent) => {
    if (!acceptsImageDrop(e)) return;
    const rel = e.relatedTarget as Node | null;
    if (rel && e.currentTarget.contains(rel)) return;
    setFileDragOver(false);
  }, []);

  const onCanvasFileDragOver = useCallback((e: React.DragEvent) => {
    if (!acceptsImageDrop(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onCanvasFileDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!projectId) return;
      setFileDragOver(false);
      if (!acceptsImageDrop(e)) return;
      e.preventDefault();
      e.stopPropagation();

      let { x: cx, y: cy } = clientToCanvas(e.clientX, e.clientY, canvasInnerRef.current);
      cx = Math.max(0, Math.min(CANVAS_W, cx));
      cy = Math.max(0, Math.min(CANVAS_H, cy));

      const files = imageFilesFromDataTransfer(e.dataTransfer);
      if (files.length > 0) {
        let i = 0;
        for (const file of files) {
          try {
            const { url, w, h } = await fileToImageItemPayload(file);
            await addImageAtCanvas({ url, width: w, height: h, canvasX: cx, canvasY: cy, offsetIndex: i });
          } catch {
            /* ignore broken file */
          }
          i += 1;
        }
        return;
      }

      const uriList = e.dataTransfer.getData("text/uri-list").trim();
      const firstLine = uriList.split(/\r?\n/).find((l) => l && !l.startsWith("#"));
      if (firstLine && /^https?:\/\//i.test(firstLine)) {
        await addImageAtCanvas({
          url: firstLine.trim(),
          width: 280,
          height: 200,
          canvasX: cx,
          canvasY: cy,
          offsetIndex: 0,
        });
      }
    },
    [projectId, addImageAtCanvas],
  );

  const boardDots: React.CSSProperties = {
    backgroundImage:
      "radial-gradient(circle, color-mix(in oklab, var(--foreground) 12%, transparent) 1px, transparent 1px)",
    backgroundSize: "20px 20px",
  };

  const onWheelZoom = useCallback((e: React.WheelEvent) => {
    if (!e.shiftKey) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = e.deltaY > 0 ? -1 : 1;
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((z + dir * ZOOM_STEP) * 100) / 100));
      return next;
    });
  }, []);

  const sorted = [...items].sort((a, b) => {
    const la = isLineLike(a) ? 0 : 1;
    const lb = isLineLike(b) ? 0 : 1;
    if (la !== lb) return la - lb;
    return a.zIndex - b.zIndex;
  });

  const primaryId = selectedIds.length ? selectedIds[selectedIds.length - 1]! : null;
  const selected = primaryId ? (items.find((i) => i.id === primaryId) ?? null) : null;

  const toggleLockSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    const states = selectedIds.map((id) => items.find((i) => i.id === id)?.locked);
    const allLocked = states.every(Boolean);
    const next = !allLocked;
    for (const id of selectedIds) {
      void onPatch(id, { locked: next });
    }
  }, [selectedIds, items, onPatch]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-[color:var(--foreground)]">
      <div className="flex min-h-0 flex-1 flex-col pt-14">
        {!projectId ? (
          <div className="m-4 rounded-xl border border-dashed border-[color:var(--card-border)] p-6 text-sm">
            Falta el id del proyecto.
          </div>
        ) : (
          <>
            <div
              className="flex flex-wrap items-center gap-2 border-b border-[color:var(--card-border)]/50 bg-[var(--card-surface)]/80 px-3 py-2 backdrop-blur-md"
              onWheel={onWheelZoom}
            >
              <div className="mr-2 flex items-center gap-1 rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/50 p-0.5">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs hover:bg-[var(--ui-accent-muted)]/30"
                  onClick={() => setZoom((z) => Math.max(MIN_ZOOM, Math.round((z - ZOOM_STEP) * 100) / 100))}
                  aria-label="Alejar"
                >
                  −
                </button>
                <span className="min-w-[3.25rem] text-center text-[11px] tabular-nums opacity-80">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-xs hover:bg-[var(--ui-accent-muted)]/30"
                  onClick={() => setZoom((z) => Math.min(MAX_ZOOM, Math.round((z + ZOOM_STEP) * 100) / 100))}
                  aria-label="Acercar"
                >
                  +
                </button>
                <button
                  type="button"
                  className="ml-1 border-l border-[color:var(--card-border)] pl-2 text-[11px] opacity-70 hover:opacity-100"
                  onClick={() => setZoom(1)}
                >
                  Reset
                </button>
              </div>
              <span className="text-[10px] opacity-45">
                Vacío: clic deselecciona · arrastra marco para elegir varios (Mayús añade) · Ctrl/Cmd + clic
                · Mayús + rueda zoom · suelta imágenes aquí
              </span>
              {selectedIds.length > 0 ? (
                <button
                  type="button"
                  className="rounded-md border border-[color:var(--card-border)] px-2 py-0.5 text-[10px] hover:bg-[var(--ui-accent-muted)]/25"
                  onClick={() => toggleLockSelection()}
                >
                  {selectedIds.every((id) => items.find((i) => i.id === id)?.locked)
                    ? "Desbloquear"
                    : "Bloquear"}
                </button>
              ) : null}
              {selected && isLineLike(selected) ? (
                <div className="flex flex-wrap items-center gap-2 border-l border-[color:var(--card-border)] pl-2 text-[10px] opacity-80">
                  <span>
                    Arrastra las <strong className="font-semibold">puntas</strong> para largo y dirección; el trazo
                    para mover.
                  </span>
                </div>
              ) : selected ? (
                <div className="flex flex-wrap items-center gap-2 border-l border-[color:var(--card-border)] pl-2 text-[10px]">
                  <label className="flex items-center gap-1 opacity-90">
                    °
                    <input
                      type="number"
                      step={1}
                      className="w-14 rounded border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-1 py-0.5"
                      value={Math.round(selected.rotationDeg)}
                      onChange={(e) =>
                        onPatch(selected.id, { rotationDeg: Number(e.target.value) || 0 })
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1 opacity-90">
                    ×
                    <input
                      type="number"
                      step={0.05}
                      min={0.05}
                      max={8}
                      className="w-14 rounded border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-1 py-0.5"
                      value={Math.round(selected.scale * 100) / 100}
                      onChange={(e) =>
                        onPatch(selected.id, {
                          scale: Math.min(8, Math.max(0.05, Number(e.target.value) || 1)),
                        })
                      }
                    />
                  </label>
                  <span className="opacity-50">Esquinas: redimensionar · Superior: girar · Mayús: proporcional</span>
                </div>
              ) : null}
              <div className="ml-auto flex flex-wrap gap-1">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
                  onClick={() => void addKind("text")}
                >
                  Texto
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
                  onClick={() => void addKind("image")}
                >
                  Imagen
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
                  onClick={() => void addKind("color")}
                >
                  Color
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
                  onClick={() => void addKind("link")}
                >
                  Enlace
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
                  onClick={() => void addKind("video")}
                >
                  Vídeo
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
                  onClick={() => void addKind("arrow")}
                >
                  Flecha
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
                  onClick={() => void addKind("shape", "rect")}
                >
                  Rect
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
                  onClick={() => void addKind("shape", "ellipse")}
                >
                  Elipse
                </button>
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] hover:bg-[var(--ui-accent-muted)]/25"
                  onClick={() => void addKind("shape", "line")}
                >
                  Línea
                </button>
              </div>
            </div>

            <DndContext
              sensors={sensors}
              modifiers={[canvasScaleModifier]}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
            >
              <div
                className={[
                  "min-h-0 flex-1 overflow-auto",
                  fileDragOver ? "ring-2 ring-inset ring-[color:var(--ui-accent)]/70 bg-[var(--ui-accent-muted)]/10" : "",
                ].join(" ")}
                onWheelCapture={onWheelZoom}
                onDragEnter={onCanvasFileDragEnter}
                onDragLeave={onCanvasFileDragLeave}
                onDragOver={onCanvasFileDragOver}
                onDrop={onCanvasFileDrop}
              >
                <div
                  style={{
                    width: CANVAS_W * zoom,
                    height: CANVAS_H * zoom,
                    position: "relative",
                  }}
                >
                  <div
                    ref={canvasInnerRef}
                    role="presentation"
                    className="absolute left-0 top-0 bg-[color:var(--hole-fill)]/30"
                    style={{
                      width: CANVAS_W,
                      height: CANVAS_H,
                      transform: `scale(${zoom})`,
                      transformOrigin: "0 0",
                      ...boardDots,
                    }}
                    onPointerDown={(e) => {
                      if (e.target !== e.currentTarget || e.button !== 0) return;
                      const { x, y } = clientToCanvas(e.clientX, e.clientY, canvasInnerRef.current);
                      marqueeSessionRef.current = { cx: x, cy: y, pointerId: e.pointerId };
                      marqueeRectRef.current = null;
                      setMarquee(null);
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        /* ignore */
                      }
                    }}
                    onPointerMove={(e) => {
                      const s = marqueeSessionRef.current;
                      if (!s || e.pointerId !== s.pointerId) return;
                      const { x, y } = clientToCanvas(e.clientX, e.clientY, canvasInnerRef.current);
                      if (Math.hypot(x - s.cx, y - s.cy) < 4) return;
                      const rect = { x1: s.cx, y1: s.cy, x2: x, y2: y };
                      marqueeRectRef.current = rect;
                      setMarquee(rect);
                    }}
                    onPointerUp={(e) => {
                      const s = marqueeSessionRef.current;
                      if (!s || e.pointerId !== s.pointerId) return;
                      try {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      } catch {
                        /* ignore */
                      }
                      marqueeSessionRef.current = null;
                      const m = marqueeRectRef.current;
                      marqueeRectRef.current = null;
                      setMarquee(null);
                      if (m) {
                        const left = Math.min(m.x1, m.x2);
                        const right = Math.max(m.x1, m.x2);
                        const top = Math.min(m.y1, m.y2);
                        const bottom = Math.max(m.y1, m.y2);
                        if (right - left >= 4 || bottom - top >= 4) {
                          const list = itemsRef.current;
                          const ids = list
                            .filter((it) => itemIntersectsRect(it, left, top, right, bottom))
                            .map((it) => it.id);
                          setSelectedIds((prev) =>
                            e.shiftKey ? [...new Set([...prev, ...ids])] : ids,
                          );
                        } else {
                          setSelectedIds([]);
                        }
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    onPointerCancel={(e) => {
                      const s = marqueeSessionRef.current;
                      if (!s || e.pointerId !== s.pointerId) return;
                      try {
                        e.currentTarget.releasePointerCapture(e.pointerId);
                      } catch {
                        /* ignore */
                      }
                      marqueeSessionRef.current = null;
                      marqueeRectRef.current = null;
                      setMarquee(null);
                    }}
                  >
                    {marquee ? (
                      <div
                        className="pointer-events-none absolute z-[5] border border-[color:var(--ui-accent)] bg-[color:var(--ui-accent)]/15"
                        style={{
                          left: Math.min(marquee.x1, marquee.x2),
                          top: Math.min(marquee.y1, marquee.y2),
                          width: Math.abs(marquee.x2 - marquee.x1),
                          height: Math.abs(marquee.y2 - marquee.y1),
                        }}
                      />
                    ) : null}
                    {sorted.map((item) => (
                      <MoodboardCanvasItem
                        key={item.id}
                        item={item}
                        selected={selectedIds.includes(item.id)}
                        onSelect={(ev) => selectItem(item.id, ev)}
                        beginGrip={(mode, ev) => beginGrip(item, mode, ev)}
                        gripActive={
                          grip != null &&
                          (grip.itemId === item.id || (grip.groupIds?.includes(item.id) ?? false))
                        }
                        followDragPx={
                          multiDragVisual?.followerIds.includes(item.id)
                            ? multiDragVisual.delta
                            : null
                        }
                        onPatch={onPatch}
                        onDelete={onDelete}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </DndContext>
          </>
        )}
      </div>
    </div>
  );
}
