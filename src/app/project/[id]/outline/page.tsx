"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  closestCorners,
  type CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Event as StoryEvent, Scene, Sequence } from "@/domain/models";
import { stageAccentVar } from "@/domain/storyColors";
import { listEventsForProject } from "@/db/repos/events";
import {
  createScene,
  createSequence,
  deleteScene,
  deleteSequence,
  listScenesForProject,
  listSequences,
  updateScene,
  updateSequence,
} from "@/db/repos/outline";

const BOARD_LAYOUT_KEY = "story-circle-outline-board-layout";
const FREE_BOARD_ID = "outline-free-board";

type BoardLayout = "horizontal" | "vertical";

function actDropId(sequenceId: string) {
  return `actColumn:${sequenceId}`;
}

function parseSluglineTitle(raw: string): { location: string; time: string } {
  const t = (raw ?? "").trim();
  if (!t) return { location: "", time: "" };
  const idx = t.lastIndexOf(" - ");
  if (idx < 0) return { location: t, time: "" };
  const location = t.slice(0, idx).trim();
  const time = t.slice(idx + 3).trim();
  return { location, time };
}

function buildSluglineTitle(location: string, time: string) {
  const loc = location.trim();
  const tod = time.trim().toUpperCase();
  if (!loc && !tod) return "Card";
  if (!tod) return loc || "Card";
  return `${loc || "INT./EXT."} - ${tod}`;
}

/** Prefer act / in-act card / trash hits over the free board so loose cards integrate into an act when dragged there. */
const outlineCollision: CollisionDetection = (args) => {
  const inPointer = pointerWithin(args);
  const base = inPointer.length > 0 ? inPointer : closestCorners(args);
  const aid = String(args.active.id);
  const draggingCard = aid.startsWith("freeCard:") || aid.startsWith("scene:");
  if (!draggingCard) return base;

  const overActOrTrash = base.filter((c) => {
    const cid = String(c.id);
    return cid.startsWith("actColumn:") || cid.startsWith("scene:");
  });

  if (overActOrTrash.length > 0) {
    const column = overActOrTrash.find((c) => String(c.id).startsWith("actColumn:"));
    if (column) return [column, ...overActOrTrash.filter((c) => c.id !== column.id)];
    return overActOrTrash;
  }

  return base;
};

function indexCardClass() {
  return [
    "relative overflow-hidden rounded-sm border border-black/[0.08] bg-[#fffef7] text-[color:#1a1a1a]",
    "shadow-[2px_3px_10px_rgba(0,0,0,0.12),0_0_0_1px_rgba(255,255,255,0.6)_inset]",
    "dark:border-white/10 dark:bg-[#1e1d1a] dark:text-[color:var(--foreground)]",
    "dark:shadow-[2px_3px_12px_rgba(0,0,0,0.45)]",
  ].join(" ");
}

function indexCardLinesStyle(): React.CSSProperties {
  return {
    backgroundImage: `repeating-linear-gradient(
      transparent,
      transparent 22px,
      rgba(59, 130, 246, 0.14) 22px,
      rgba(59, 130, 246, 0.14) 23px
    )`,
  };
}

function boardPointFromActive(ev: DragEndEvent, boardEl: HTMLElement | null): { x: number; y: number } | null {
  const rectObj = ev.active.rect.current;
  const cr = rectObj?.translated ?? rectObj?.initial;
  if (!boardEl || !cr) return null;
  const br = boardEl.getBoundingClientRect();
  return {
    x: Math.max(0, Math.round(cr.left - br.left)),
    y: Math.max(0, Math.round(cr.top - br.top)),
  };
}

type OverParsed =
  | { kind: "scene"; sceneId: string }
  | { kind: "actColumn"; sequenceId: string }
  | { kind: "freeBoard" }
  | { kind: "freeCard" };

function parseOver(overId: string | null): OverParsed | null {
  if (!overId) return null;
  if (overId === FREE_BOARD_ID) return { kind: "freeBoard" };
  if (overId.startsWith("freeCard:")) return { kind: "freeCard" };
  if (overId.startsWith("scene:")) return { kind: "scene", sceneId: overId.slice("scene:".length) };
  if (overId.startsWith("actColumn:")) return { kind: "actColumn", sequenceId: overId.slice("actColumn:".length) };
  return null;
}

/** When `over` still points at the free board, use all collision targets to find an act / in-act card. */
function integrationTargetFromCollisions(ev: DragEndEvent, scenes: Scene[]): OverParsed | null {
  const ids = (ev.collisions ?? []).map((c) => String(c.id));
  const col = ids.find((id) => id.startsWith("actColumn:"));
  if (col) return parseOver(col);
  for (const id of ids) {
    if (!id.startsWith("scene:")) continue;
    const sid = id.slice("scene:".length);
    const sc = scenes.find((s) => s.id === sid);
    if (sc && sc.sequenceId !== "") return parseOver(id);
  }
  return null;
}

function SortableIndexCard({
  scene,
  indexInAct,
  eventById,
  onPatchScene,
  onDeleteScene,
  rootClassName = "",
}: {
  scene: Scene;
  indexInAct: number;
  eventById: Map<string, StoryEvent>;
  onPatchScene: (id: string, patch: Partial<Pick<Scene, "title" | "summary">>) => void;
  onDeleteScene: (id: string) => void;
  rootClassName?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `scene:${scene.id}`,
    data: { type: "scene", sceneId: scene.id, sequenceId: scene.sequenceId },
  });

  const parsed = useMemo(() => parseSluglineTitle(scene.title), [scene.title]);
  const [location, setLocation] = useState(parsed.location);
  const [timeOfDay, setTimeOfDay] = useState(parsed.time);
  const [summary, setSummary] = useState(scene.summary);
  useEffect(() => {
    const p = parseSluglineTitle(scene.title);
    setLocation(p.location);
    setTimeOfDay(p.time);
    setSummary(scene.summary);
  }, [scene.id, scene.title, scene.summary]);

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const linked = scene.sourceEventIds
    .map((id) => eventById.get(id))
    .filter(Boolean) as StoryEvent[];

  return (
    <div
      ref={setSortRef}
      style={style}
      className={[
        indexCardClass(),
        rootClassName,
        "cursor-grab touch-none outline-none active:cursor-grabbing",
        isDragging ? "z-10 opacity-60 ring-2 ring-[color:var(--ui-accent)]" : "",
      ].join(" ")}
      aria-label="Card — drag to an act or to empty space"
      {...attributes}
      {...listeners}
    >
      <div
        className="pointer-events-none absolute bottom-0 left-0 top-0 w-[3px] bg-[#c62828]/85 dark:bg-red-500/70"
        aria-hidden
      />
      <div className="relative select-none pl-3 pr-2 pt-2">
        <div className="flex items-start gap-1.5">
          <div
            className="mt-0.5 pointer-events-none text-[10px] leading-none text-black/35 dark:text-white/35"
            aria-hidden
          >
            ⋮⋮
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={() => {
                const next = buildSluglineTitle(location, timeOfDay);
                if (next !== scene.title) onPatchScene(scene.id, { title: next });
              }}
              className="w-full cursor-text select-text border-0 bg-transparent text-[11px] font-bold uppercase outline-none ring-0 placeholder:opacity-40"
              placeholder="INT./EXT. LOCATION"
            />
            <input
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={() => {
                const next = buildSluglineTitle(location, timeOfDay);
                if (next !== scene.title) onPatchScene(scene.id, { title: next });
              }}
              className="mt-0.5 w-full cursor-text select-text border-0 bg-transparent text-[10px] font-semibold uppercase opacity-70 outline-none ring-0 placeholder:opacity-40"
              placeholder="DAY / NIGHT"
            />
          </div>
          <span className="shrink-0 rounded bg-amber-200/90 px-1 py-0.5 text-[9px] font-bold tabular-nums text-amber-950 dark:bg-amber-900/50 dark:text-amber-100">
            {indexInAct + 1}
          </span>
        </div>
        <div className="relative mt-1 min-h-[88px] pl-0.5" style={indexCardLinesStyle()}>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={() => {
              if (summary !== scene.summary) onPatchScene(scene.id, { summary });
            }}
            rows={4}
            placeholder="Beat notes…"
            className="w-full cursor-text select-text resize-y border-0 bg-transparent py-0.5 text-[10px] leading-[23px] outline-none ring-0 placeholder:opacity-40"
          />
        </div>
        {linked.length ? (
          <div className="mt-1 flex flex-wrap gap-0.5 pb-2" onPointerDown={(e) => e.stopPropagation()}>
            {linked.slice(0, 5).map((e) => (
              <span
                key={e.id}
                className="max-w-full truncate rounded border px-1 py-0.5 text-[9px]"
                style={{
                  borderColor: `color-mix(in srgb, var(${stageAccentVar(e.stage)}) 40%, var(--card-border))`,
                  background: `color-mix(in srgb, var(${stageAccentVar(e.stage)}) 10%, transparent)`,
                }}
              >
                {e.title}
              </span>
            ))}
            {linked.length > 5 ? (
              <span className="text-[9px] opacity-50">+{linked.length - 5}</span>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end border-t border-black/[0.06] py-1 dark:border-white/10">
          <button
            type="button"
            className="text-[9px] font-medium text-red-600/80 hover:text-red-600 dark:text-red-400/90"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDeleteScene(scene.id)}
          >
            Delete card
          </button>
        </div>
      </div>
    </div>
  );
}

function FreeIndexCard({
  scene,
  indexLabel,
  eventById,
  onPatchScene,
  onDeleteScene,
}: {
  scene: Scene;
  indexLabel: number;
  eventById: Map<string, StoryEvent>;
  onPatchScene: (id: string, patch: Partial<Pick<Scene, "title" | "summary">>) => void;
  onDeleteScene: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `freeCard:${scene.id}`,
    data: { type: "freeCard", sceneId: scene.id },
  });

  const parsed = useMemo(() => parseSluglineTitle(scene.title), [scene.title]);
  const [location, setLocation] = useState(parsed.location);
  const [timeOfDay, setTimeOfDay] = useState(parsed.time);
  const [summary, setSummary] = useState(scene.summary);
  useEffect(() => {
    const p = parseSluglineTitle(scene.title);
    setLocation(p.location);
    setTimeOfDay(p.time);
    setSummary(scene.summary);
  }, [scene.id, scene.title, scene.summary]);

  const lx = scene.boardX ?? 0;
  const ly = scene.boardY ?? 0;

  const style: React.CSSProperties = {
    left: lx,
    top: ly,
    transform: CSS.Translate.toString(transform),
  };

  const linked = scene.sourceEventIds
    .map((id) => eventById.get(id))
    .filter(Boolean) as StoryEvent[];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        indexCardClass(),
        "pointer-events-auto absolute z-[100] w-[min(260px,85vw)] min-w-[220px] touch-none outline-none sm:w-[260px]",
        isDragging ? "z-[200] opacity-80 ring-2 ring-[color:var(--ui-accent)]" : "",
      ].join(" ")}
      aria-label="Free card — drag to an act or move on the board"
      {...attributes}
    >
      <div
        className="pointer-events-none absolute bottom-0 left-0 top-0 w-[3px] bg-[#c62828]/85 dark:bg-red-500/70"
        aria-hidden
      />
      <div className="relative select-none pl-3 pr-2 pt-2">
        <div className="flex items-start gap-1.5">
          <button
            type="button"
            className="mt-0.5 shrink-0 cursor-grab touch-none rounded px-0.5 text-[10px] leading-none text-black/40 hover:text-black/70 active:cursor-grabbing dark:text-white/40 dark:hover:text-white/70"
            aria-label="Drag card"
            {...listeners}
          >
            ⋮⋮
          </button>
          <div className="min-w-0 flex-1">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={() => {
                const next = buildSluglineTitle(location, timeOfDay);
                if (next !== scene.title) onPatchScene(scene.id, { title: next });
              }}
              className="w-full cursor-text select-text border-0 bg-transparent text-[11px] font-bold uppercase outline-none ring-0 placeholder:opacity-40"
              placeholder="INT./EXT. LOCATION"
            />
            <input
              value={timeOfDay}
              onChange={(e) => setTimeOfDay(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={() => {
                const next = buildSluglineTitle(location, timeOfDay);
                if (next !== scene.title) onPatchScene(scene.id, { title: next });
              }}
              className="mt-0.5 w-full cursor-text select-text border-0 bg-transparent text-[10px] font-semibold uppercase opacity-70 outline-none ring-0 placeholder:opacity-40"
              placeholder="DAY / NIGHT"
            />
          </div>
          <span className="shrink-0 rounded bg-amber-200/90 px-1 py-0.5 text-[9px] font-bold tabular-nums text-amber-950 dark:bg-amber-900/50 dark:text-amber-100">
            {indexLabel}
          </span>
        </div>
        <div className="relative mt-1 min-h-[88px] pl-0.5" style={indexCardLinesStyle()}>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={() => {
              if (summary !== scene.summary) onPatchScene(scene.id, { summary });
            }}
            rows={4}
            placeholder="Beat notes…"
            className="w-full cursor-text select-text resize-y border-0 bg-transparent py-0.5 text-[10px] leading-[23px] outline-none ring-0 placeholder:opacity-40"
          />
        </div>
        {linked.length ? (
          <div className="mt-1 flex flex-wrap gap-0.5 pb-2" onPointerDown={(e) => e.stopPropagation()}>
            {linked.slice(0, 5).map((e) => (
              <span
                key={e.id}
                className="max-w-full truncate rounded border px-1 py-0.5 text-[9px]"
                style={{
                  borderColor: `color-mix(in srgb, var(${stageAccentVar(e.stage)}) 40%, var(--card-border))`,
                  background: `color-mix(in srgb, var(${stageAccentVar(e.stage)}) 10%, transparent)`,
                }}
              >
                {e.title}
              </span>
            ))}
            {linked.length > 5 ? (
              <span className="text-[9px] opacity-50">+{linked.length - 5}</span>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end border-t border-black/[0.06] py-1 dark:border-white/10">
          <button
            type="button"
            className="text-[9px] font-medium text-red-600/80 hover:text-red-600 dark:text-red-400/90"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDeleteScene(scene.id)}
          >
            Delete card
          </button>
        </div>
      </div>
    </div>
  );
}

function ActColumn({
  seq,
  scenes,
  boardLayout,
  eventById,
  onPatchScene,
  onDeleteScene,
  onAddCard,
  onRenameAct,
  onDeleteAct,
}: {
  seq: Sequence;
  scenes: Scene[];
  boardLayout: BoardLayout;
  eventById: Map<string, StoryEvent>;
  onPatchScene: (id: string, patch: Partial<Pick<Scene, "title" | "summary">>) => void;
  onDeleteScene: (id: string) => void;
  onAddCard: () => void;
  onRenameAct: (title: string) => void;
  onDeleteAct: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setColSortRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `seq:${seq.id}`,
    data: { type: "sequence", sequenceId: seq.id },
  });

  const { setNodeRef: setColDropRef, isOver: colOver } = useDroppable({
    id: actDropId(seq.id),
    data: { type: "actColumn", sequenceId: seq.id },
  });

  const colRef = useCallback(
    (node: HTMLDivElement | null) => {
      setColSortRef(node);
      setColDropRef(node);
    },
    [setColSortRef, setColDropRef],
  );

  const colStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [actTitle, setActTitle] = useState(seq.title);
  useEffect(() => setActTitle(seq.title), [seq.id, seq.title]);

  const cardsVertical = boardLayout === "horizontal";
  const cardSortStrategy = cardsVertical ? verticalListSortingStrategy : horizontalListSortingStrategy;

  return (
    <div
      ref={colRef}
      style={colStyle}
      className={[
        "flex shrink-0 flex-col",
        boardLayout === "horizontal" ? "w-[min(100%,240px)] sm:w-[260px]" : "w-full",
        isDragging ? "opacity-70" : "",
      ].join(" ")}
    >
      <div className="mb-2 flex items-center gap-1 rounded-t-lg border border-b-0 border-[#8b6914]/35 bg-[#e8d4a8] px-2 py-2 dark:border-amber-900/50 dark:bg-[#2a2218]">
        <button
          type="button"
          className="cursor-grab touch-none px-0.5 text-[10px] opacity-50 hover:opacity-90"
          aria-label="Reorder act"
          {...attributes}
          {...listeners}
        >
          ⣿
        </button>
        <input
          value={actTitle}
          onChange={(e) => setActTitle(e.target.value)}
          onBlur={() => {
            const t = actTitle.trim() || "Act";
            if (t !== seq.title) onRenameAct(t);
          }}
          className="min-w-0 flex-1 border-0 bg-transparent text-xs font-bold outline-none dark:placeholder:opacity-40"
        />
        <button
          type="button"
          className="shrink-0 text-[10px] font-medium text-red-700/70 hover:text-red-700 dark:text-red-400/80"
          onClick={onDeleteAct}
          title="Delete act and all cards"
        >
          ×
        </button>
      </div>
      <div
        className={[
          "flex min-h-[200px] flex-1 gap-2 rounded-b-lg border border-t-0 border-[#8b6914]/30 bg-[#b8935e]/40 p-2 dark:border-amber-900/40 dark:bg-black/20",
          "flex-col",
          colOver ? "ring-2 ring-[color:var(--ui-accent)] ring-offset-2 ring-offset-transparent" : "",
        ].join(" ")}
      >
        <div
          className={
            cardsVertical
              ? "flex min-h-0 flex-1 flex-col gap-2"
              : "flex min-h-0 min-w-0 flex-1 flex-row flex-wrap gap-2 overflow-x-auto sm:flex-nowrap"
          }
        >
          <SortableContext id={`act-scenes-${seq.id}`} items={scenes.map((s) => `scene:${s.id}`)} strategy={cardSortStrategy}>
            {scenes.map((scene, i) => (
              <SortableIndexCard
                key={scene.id}
                scene={scene}
                indexInAct={i}
                eventById={eventById}
                onPatchScene={onPatchScene}
                onDeleteScene={onDeleteScene}
                rootClassName={cardsVertical ? "" : "min-w-[220px] w-[min(260px,85vw)] shrink-0 sm:w-[260px]"}
              />
            ))}
          </SortableContext>
        </div>
        <button
          type="button"
          onClick={onAddCard}
          className="w-full shrink-0 rounded-md border border-dashed border-black/20 bg-black/5 py-2 text-[10px] font-semibold uppercase tracking-wide text-black/60 hover:bg-black/10 dark:border-white/20 dark:bg-white/5 dark:text-white/60"
        >
          + Add card
        </button>
      </div>
    </div>
  );
}

function FreeBoardDropLayer({ onNode }: { onNode: (node: HTMLDivElement | null) => void }) {
  const { setNodeRef } = useDroppable({ id: FREE_BOARD_ID });
  const merged = useCallback(
    (node: HTMLDivElement | null) => {
      setNodeRef(node);
      onNode(node);
    },
    [setNodeRef, onNode],
  );
  return <div ref={merged} className="absolute inset-0 z-0 min-h-full" aria-hidden />;
}

export default function OutlinePage() {
  const params = useParams<{ id?: string | string[] }>();
  const projectId = Array.isArray(params?.id) ? params?.id[0] : params?.id;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const lastSceneOverRef = useRef<string | null>(null);
  const freeBoardRef = useRef<HTMLDivElement | null>(null);

  const [events, setEvents] = useState<StoryEvent[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [boardLayout, setBoardLayout] = useState<BoardLayout>("horizontal");
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  const captureFreeBoardEl = useCallback((node: HTMLDivElement | null) => {
    freeBoardRef.current = node;
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOARD_LAYOUT_KEY);
      if (raw === "vertical" || raw === "horizontal") setBoardLayout(raw);
    } catch {
      /* ignore */
    }
  }, []);

  function setBoardLayoutPersist(next: BoardLayout) {
    setBoardLayout(next);
    try {
      localStorage.setItem(BOARD_LAYOUT_KEY, next);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const [evts, seqs, scs] = await Promise.all([
        listEventsForProject(projectId),
        listSequences(projectId),
        listScenesForProject(projectId),
      ]);
      if (cancelled) return;
      setEvents(evts);
      setSequences(seqs.sort((a, b) => a.order - b.order));
      const loose = scs.filter((s) => s.sequenceId === "");
      const needsPos = loose.filter((s) => s.boardX == null || s.boardY == null);
      if (needsPos.length > 0) {
        await Promise.all(
          needsPos.map((s, i) =>
            updateScene(s.id, {
              boardX: 24 + (i % 5) * 40,
              boardY: 24 + Math.floor(i / 5) * 140,
            }),
          ),
        );
        setScenes(
          scs.map((s) => {
            const ix = needsPos.findIndex((n) => n.id === s.id);
            if (ix < 0) return s;
            return {
              ...s,
              boardX: 24 + (ix % 5) * 40,
              boardY: 24 + Math.floor(ix / 5) * 140,
            };
          }),
        );
      } else {
        setScenes(scs);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e] as const)), [events]);

  const scenesBySeq = useMemo(() => {
    const m = new Map<string, Scene[]>();
    for (const s of scenes) {
      const list = m.get(s.sequenceId) ?? [];
      list.push(s);
      m.set(s.sequenceId, list);
    }
    for (const [k, list] of m) {
      m.set(k, [...list].sort((a, b) => a.order - b.order));
    }
    return m;
  }, [scenes]);

  const freeScenes = useMemo(
    () => [...(scenesBySeq.get("") ?? [])].sort((a, b) => a.order - b.order),
    [scenesBySeq],
  );

  async function persistSequenceOrder(next: Sequence[]) {
    setSequences(next);
    await Promise.all(next.map((s, idx) => updateSequence(s.id, { order: idx })));
  }

  async function moveScene(sceneId: string, targetSequenceId: string, targetIndex: number) {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const srcSeq = scene.sequenceId;

    if (srcSeq === targetSequenceId) {
      const list = [...(scenesBySeq.get(targetSequenceId) ?? [])].sort((a, b) => a.order - b.order);
      const oldIdx = list.findIndex((s) => s.id === sceneId);
      if (oldIdx < 0) return;
      const clamped = Math.max(0, Math.min(targetIndex, list.length - 1));
      if (oldIdx === clamped) return;
      const nextList = arrayMove(list, oldIdx, clamped);
      const updates = nextList.map((s, i) => ({ ...s, order: i }));
      setScenes((prev) => {
        const rest = prev.filter((s) => s.sequenceId !== targetSequenceId);
        return [...rest, ...updates];
      });
      await Promise.all(updates.map((s) => updateScene(s.id, { order: s.order })));
      return;
    }

    const sourceList = [...(scenesBySeq.get(srcSeq) ?? [])]
      .filter((s) => s.id !== sceneId)
      .sort((a, b) => a.order - b.order)
      .map((s, i) => ({ ...s, order: i }));
    const targetList = [...(scenesBySeq.get(targetSequenceId) ?? [])].sort((a, b) => a.order - b.order);
    const insertAt = Math.max(0, Math.min(targetIndex, targetList.length));
    const moved: Scene = {
      ...scene,
      sequenceId: targetSequenceId,
      boardX: null,
      boardY: null,
    };
    targetList.splice(insertAt, 0, moved);
    const newTarget = targetList.map((s, i) => ({ ...s, order: i, sequenceId: targetSequenceId }));

    setScenes((prev) => {
      const rest = prev.filter((s) => s.sequenceId !== srcSeq && s.sequenceId !== targetSequenceId);
      return [...rest, ...sourceList, ...newTarget];
    });

    await Promise.all(sourceList.map((s) => updateScene(s.id, { order: s.order, sequenceId: s.sequenceId })));
    await Promise.all(
      newTarget.map((s) =>
        updateScene(s.id, { order: s.order, sequenceId: s.sequenceId, boardX: s.boardX, boardY: s.boardY }),
      ),
    );
  }

  const detachSceneToBoard = useCallback(
    async (sceneId: string, x: number, y: number) => {
      const scene = scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      if (scene.sequenceId === "") {
        await updateScene(sceneId, { boardX: x, boardY: y });
        setScenes((prev) =>
          prev.map((s) => (s.id === sceneId ? { ...s, boardX: x, boardY: y } : s)),
        );
        return;
      }
      const srcSeq = scene.sequenceId;
      const sourceList = [...(scenesBySeq.get(srcSeq) ?? [])]
        .filter((s) => s.id !== sceneId)
        .sort((a, b) => a.order - b.order)
        .map((s, i) => ({ ...s, order: i }));
      const freeBefore = [...(scenesBySeq.get("") ?? [])].sort((a, b) => a.order - b.order);
      const loose: Scene = {
        ...scene,
        sequenceId: "",
        boardX: x,
        boardY: y,
        order: freeBefore.length,
      };
      const newFree = [...freeBefore, loose].map((s, i) => ({ ...s, order: i }));

      setScenes((prev) => {
        const rest = prev.filter((s) => s.sequenceId !== srcSeq && s.sequenceId !== "");
        return [...rest, ...sourceList, ...newFree];
      });

      await Promise.all(sourceList.map((s) => updateScene(s.id, { order: s.order, sequenceId: s.sequenceId })));
      await Promise.all(
        newFree.map((s) =>
          updateScene(s.id, { order: s.order, sequenceId: s.sequenceId, boardX: s.boardX, boardY: s.boardY }),
        ),
      );
    },
    [scenes, scenesBySeq],
  );

  async function patchScene(sceneId: string, patch: Partial<Pick<Scene, "title" | "summary">>) {
    await updateScene(sceneId, patch);
    setScenes((prev) => prev.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)));
  }

  async function removeScene(sceneId: string) {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    await deleteScene(sceneId);
    const list = (scenesBySeq.get(scene.sequenceId) ?? []).filter((s) => s.id !== sceneId);
    const reindexed = list.map((s, i) => ({ ...s, order: i }));
    const seqId = scene.sequenceId;
    setScenes((prev) => [...prev.filter((s) => s.sequenceId !== seqId), ...reindexed]);
    await Promise.all(reindexed.map((s) => updateScene(s.id, { order: s.order })));
  }

  const onDragOver = useCallback((ev: DragOverEvent) => {
    if (ev.over?.id != null) lastSceneOverRef.current = String(ev.over.id);
  }, []);

  const onDragCancel = useCallback(() => {
    lastSceneOverRef.current = null;
    setActiveLabel(null);
  }, []);

  const onDragStart = useCallback(
    (ev: DragStartEvent) => {
      lastSceneOverRef.current = null;
      const id = String(ev.active.id);
      if (id.startsWith("scene:") || id.startsWith("freeCard:")) {
        const sid = id.startsWith("scene:") ? id.slice("scene:".length) : id.slice("freeCard:".length);
        const s = scenes.find((x) => x.id === sid);
        setActiveLabel(s?.title ?? "Card");
      } else if (id.startsWith("seq:")) {
        const q = sequences.find((x) => x.id === id.slice("seq:".length));
        setActiveLabel(q?.title ?? "Act");
      } else setActiveLabel(null);
    },
    [scenes, sequences],
  );

  const onDragEnd = useCallback(
    async (ev: DragEndEvent) => {
      setActiveLabel(null);
      const activeId = String(ev.active.id);
      let overRaw = ev.over?.id != null ? String(ev.over.id) : null;
      if (!overRaw && (activeId.startsWith("scene:") || activeId.startsWith("freeCard:"))) {
        overRaw = lastSceneOverRef.current;
      }
      lastSceneOverRef.current = null;
      let over = parseOver(overRaw);
      const boardEl = freeBoardRef.current;

      if (activeId.startsWith("freeCard:")) {
        const sceneId = activeId.slice("freeCard:".length);
        const activeScene = scenes.find((s) => s.id === sceneId);
        if (!activeScene) return;

        if (
          over == null ||
          over.kind === "freeBoard" ||
          over.kind === "freeCard" ||
          overRaw === FREE_BOARD_ID
        ) {
          const integrated = integrationTargetFromCollisions(ev, scenes);
          if (
            integrated &&
            (integrated.kind === "actColumn" || integrated.kind === "scene")
          ) {
            over = integrated;
          }
        }

        if (over?.kind === "actColumn") {
          const list = [...(scenesBySeq.get(over.sequenceId) ?? [])].sort((a, b) => a.order - b.order);
          const without = list.filter((s) => s.id !== sceneId);
          await moveScene(sceneId, over.sequenceId, without.length);
          return;
        }

        if (over?.kind === "scene") {
          const hit = over;
          const overScene = scenes.find((s) => s.id === hit.sceneId);
          if (!overScene || overScene.id === sceneId) return;
          if (overScene.sequenceId !== "") {
            const targetSeq = overScene.sequenceId;
            const sorted = [...(scenesBySeq.get(targetSeq) ?? [])].sort((a, b) => a.order - b.order);
            const insertIndex = sorted.findIndex((s) => s.id === hit.sceneId);
            const insertAt = insertIndex < 0 ? sorted.length : insertIndex;
            await moveScene(sceneId, targetSeq, insertAt);
            return;
          }
        }

        const nx = Math.round((activeScene.boardX ?? 0) + ev.delta.x);
        const ny = Math.round((activeScene.boardY ?? 0) + ev.delta.y);
        await updateScene(sceneId, { boardX: Math.max(0, nx), boardY: Math.max(0, ny) });
        setScenes((prev) =>
          prev.map((s) =>
            s.id === sceneId ? { ...s, boardX: Math.max(0, nx), boardY: Math.max(0, ny) } : s,
          ),
        );
        return;
      }

      if (activeId.startsWith("scene:")) {
        const sceneId = activeId.slice("scene:".length);
        const activeScene = scenes.find((s) => s.id === sceneId);
        if (!activeScene) return;

        const releaseOnBoard =
          over?.kind === "freeBoard" ||
          over?.kind === "freeCard" ||
          (over == null &&
            overRaw != null &&
            (overRaw === FREE_BOARD_ID || overRaw.startsWith("freeCard:")));

        if (releaseOnBoard) {
          const pt = boardPointFromActive(ev, boardEl);
          if (pt) await detachSceneToBoard(sceneId, pt.x, pt.y);
          return;
        }

        if (over?.kind === "actColumn") {
          const list = [...(scenesBySeq.get(over.sequenceId) ?? [])].sort((a, b) => a.order - b.order);
          const without = list.filter((s) => s.id !== sceneId);
          await moveScene(sceneId, over.sequenceId, without.length);
          return;
        }

        if (over?.kind === "scene") {
          const overScene = scenes.find((s) => s.id === over.sceneId);
          if (!overScene) return;

          if (overScene.sequenceId === "") {
            const pt = boardPointFromActive(ev, boardEl);
            if (pt) await detachSceneToBoard(sceneId, pt.x, pt.y);
            return;
          }

          const targetSeq = overScene.sequenceId;
          const sorted = [...(scenesBySeq.get(targetSeq) ?? [])].sort((a, b) => a.order - b.order);
          if (activeScene.sequenceId === targetSeq) {
            const oldIdx = sorted.findIndex((s) => s.id === sceneId);
            const newIdx = sorted.findIndex((s) => s.id === over.sceneId);
            if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
            const nextList = arrayMove(sorted, oldIdx, newIdx);
            const updates = nextList.map((s, i) => ({ ...s, order: i }));
            setScenes((prev) => {
              const rest = prev.filter((s) => s.sequenceId !== targetSeq);
              return [...rest, ...updates];
            });
            await Promise.all(updates.map((s) => updateScene(s.id, { order: s.order })));
            return;
          }
          const insertIndex = sorted.findIndex((s) => s.id === over.sceneId);
          const insertAt = insertIndex < 0 ? sorted.length : insertIndex;
          await moveScene(sceneId, targetSeq, insertAt);
          return;
        }
      }

      if (activeId.startsWith("seq:")) {
        const activeSeqId = activeId.slice("seq:".length);
        if (overRaw?.startsWith("seq:")) {
          const overSeqId = overRaw.slice("seq:".length);
          const oldIndex = sequences.findIndex((s) => s.id === activeSeqId);
          const newIndex = sequences.findIndex((s) => s.id === overSeqId);
          if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
          const next = arrayMove(sequences, oldIndex, newIndex);
          await persistSequenceOrder(next);
        }
      }
    },
    [detachSceneToBoard, scenes, scenesBySeq, sequences],
  );

  async function addFreeCard() {
    if (!projectId) return;
    const n = freeScenes.length;
    const scn = await createScene({
      projectId,
      title: "New card",
      boardX: 32 + (n % 6) * 36,
      boardY: 32 + Math.floor(n / 6) * 150,
    });
    setScenes((prev) => [...prev, scn]);
  }

  async function addAct() {
    if (!projectId) return;
    const n = sequences.length + 1;
    const seq = await createSequence({ projectId, title: `Act ${n}` });
    const next = await listSequences(projectId);
    setSequences(next.sort((a, b) => a.order - b.order));
  }

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      void onDragEnd(e);
    },
    [onDragEnd],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto bg-transparent text-[color:var(--foreground)]">
      <div className="mx-auto flex min-h-0 w-full max-w-none flex-1 flex-col px-3 pb-10 pt-16 sm:px-4">
        {!projectId ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--card-border)] bg-[var(--card-surface)] p-8 text-sm">
            Missing project id in the URL.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={outlineCollision}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragCancel={onDragCancel}
            onDragEnd={handleDragEnd}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="text-sm font-semibold">Outline — index cards</h1>
                  <p className="text-[11px] opacity-60">
                    Drop cards on empty space to leave them on the board; drop on an act to pin them there.
                    Drag acts with the handle. Trash deletes.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex overflow-hidden rounded-lg border border-[color:var(--card-border)] text-[10px] font-semibold">
                    <button
                      type="button"
                      onClick={() => setBoardLayoutPersist("horizontal")}
                      className={
                        boardLayout === "horizontal"
                          ? "bg-[var(--ui-accent)] px-2.5 py-2 text-[var(--ui-accent-contrast)]"
                          : "px-2.5 py-2 opacity-70 hover:opacity-100"
                      }
                    >
                      Columns
                    </button>
                    <button
                      type="button"
                      onClick={() => setBoardLayoutPersist("vertical")}
                      className={
                        boardLayout === "vertical"
                          ? "bg-[var(--ui-accent)] px-2.5 py-2 text-[var(--ui-accent-contrast)]"
                          : "px-2.5 py-2 opacity-70 hover:opacity-100"
                      }
                    >
                      Rows
                    </button>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-[color:var(--card-border)] bg-[var(--card-surface)] px-3 py-2 text-xs font-medium hover:bg-[var(--hole-fill)]"
                    onClick={() => void addFreeCard()}
                  >
                    + Card
                  </button>
                  <button
                    type="button"
                    className="rounded-xl px-3 py-2 text-xs font-medium text-[var(--ui-accent-contrast)] hover:opacity-95"
                    style={{ background: "var(--ui-accent)" }}
                    onClick={() => void addAct()}
                  >
                    + Act
                  </button>
                </div>
              </div>

              <div className="relative min-h-[min(88vh,920px)] w-full">
                <FreeBoardDropLayer onNode={captureFreeBoardEl} />

                <div className="relative z-[1]">
                  {sequences.length === 0 ? (
                    <div className="flex min-h-[200px] items-center justify-center text-sm opacity-70">
                      No acts yet. Click <strong className="px-1">+ Act</strong> — use <strong className="px-1">+ Card</strong>{" "}
                      for free cards on the board.
                    </div>
                  ) : (
                    <div
                      className={
                        boardLayout === "horizontal" ? "overflow-x-auto pb-2" : "pb-2"
                      }
                    >
                      <SortableContext
                        items={sequences.map((s) => `seq:${s.id}`)}
                        strategy={
                          boardLayout === "horizontal"
                            ? horizontalListSortingStrategy
                            : verticalListSortingStrategy
                        }
                      >
                        <div
                          className={
                            boardLayout === "horizontal"
                              ? "flex min-h-[320px] gap-3 px-1"
                              : "flex min-h-[320px] flex-col gap-4 px-1"
                          }
                        >
                          {sequences.map((seq) => (
                            <ActColumn
                              key={seq.id}
                              seq={seq}
                              boardLayout={boardLayout}
                              scenes={scenesBySeq.get(seq.id) ?? []}
                              eventById={eventById}
                              onPatchScene={patchScene}
                              onDeleteScene={(id) => void removeScene(id)}
                              onAddCard={async () => {
                                const scn = await createScene({
                                  projectId: projectId!,
                                  sequenceId: seq.id,
                                  title: "New card",
                                });
                                setScenes((prev) => [...prev, scn]);
                              }}
                              onRenameAct={async (title) => {
                                await updateSequence(seq.id, { title });
                                setSequences((prev) => prev.map((s) => (s.id === seq.id ? { ...s, title } : s)));
                              }}
                              onDeleteAct={async () => {
                                if (!confirm(`Delete "${seq.title}" and all its cards?`)) return;
                                await deleteSequence(seq.id);
                                setSequences((prev) => prev.filter((s) => s.id !== seq.id));
                                setScenes((prev) => prev.filter((s) => s.sequenceId !== seq.id));
                              }}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </div>
                  )}
                </div>

                <div className="pointer-events-none absolute inset-0 z-[50] overflow-visible">
                  {freeScenes.map((scene, i) => (
                    <FreeIndexCard
                      key={scene.id}
                      scene={scene}
                      indexLabel={i + 1}
                      eventById={eventById}
                      onPatchScene={patchScene}
                      onDeleteScene={(id) => void removeScene(id)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <DragOverlay dropAnimation={null}>
              {activeLabel ? (
                <div className="max-w-[220px] rounded-sm border border-black/10 bg-[#fffef7] px-3 py-2 text-xs font-semibold shadow-lg dark:bg-[#1e1d1a]">
                  {activeLabel}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </div>
  );
}
