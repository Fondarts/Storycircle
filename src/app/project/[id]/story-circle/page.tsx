"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
// DnD-related imports are still used by EventCard (legacy editor).
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { Event as StoryEvent } from "@/domain/models";
import type { StoryStage } from "@/domain/storyStage";
import { STORY_STAGES, STORY_STAGE_LABELS } from "@/domain/storyStage";
import {
  CIRCLE_DIAGRAM_VARIANT_STORAGE_KEY,
  HERO_JOURNEY_STEPS,
  hjActAccentVar,
  hjActRingFillVar,
  hjActRingStrokeVar,
  type CircleDiagramVariant,
} from "@/domain/heroJourney";
import { stageAccentVar } from "@/domain/storyColors";
import { bulkUpdateEvents, createEvent, deleteEvent, listEventsForProject, updateEvent } from "@/db/repos/events";
import {
  heroJourneyNoteBeatState,
  listHeroJourneyNotes,
  upsertHeroJourneyNote,
} from "@/db/repos/heroJourneyNotes";
import { listStageNotes, stageNoteBeatState, upsertStageNote } from "@/db/repos/stageNotes";

type StageBuckets = Record<StoryStage, StoryEvent[]>;

type StageCardPos = Record<StoryStage, { x: number; y: number } | null>;

/** Hero's Journey step 1–12 → normalized card position */
type HjCardPos = Record<number, { x: number; y: number } | null>;

type StageBeatState = {
  beatOptions: string[];
  activeBeatIndex: number;
};

function emptyBeatState(): StageBeatState {
  return { beatOptions: [""], activeBeatIndex: 0 };
}

function defaultBeatStates(): Record<StoryStage, StageBeatState> {
  return Object.fromEntries(STORY_STAGES.map((s) => [s, emptyBeatState()])) as Record<
    StoryStage,
    StageBeatState
  >;
}

function defaultHjCardPos(): HjCardPos {
  return Object.fromEntries(HERO_JOURNEY_STEPS.map((s) => [s.step, null])) as HjCardPos;
}

function defaultHjBeatStates(): Record<number, StageBeatState> {
  return Object.fromEntries(HERO_JOURNEY_STEPS.map((s) => [s.step, emptyBeatState()])) as Record<
    number,
    StageBeatState
  >;
}

function beatMenuPreview(text: string, index: number): string {
  const t = text.trim();
  if (!t) return `Draft ${index + 1}`;
  const one = t.replace(/\s+/g, " ");
  return one.length > 36 ? `${one.slice(0, 36)}…` : one;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function distPointToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const t = Math.max(0, Math.min(1, (abx * apx + aby * apy) / lenSq));
  const nx = a.x + t * abx;
  const ny = a.y + t * aby;
  return Math.hypot(p.x - nx, p.y - ny);
}

/** Midpoint of the card edge that is closest to `p` (e.g. circle rim point). */
function midpointOfClosestCardEdge(
  rect: { x: number; y: number; w: number; h: number },
  p: { x: number; y: number },
): { x: number; y: number } {
  const { x, y, w, h } = rect;
  const edges: Array<{ mid: { x: number; y: number }; d: number }> = [
    {
      mid: { x, y: y + h / 2 },
      d: distPointToSegment(p, { x, y }, { x, y: y + h }),
    },
    {
      mid: { x: x + w, y: y + h / 2 },
      d: distPointToSegment(p, { x: x + w, y }, { x: x + w, y: y + h }),
    },
    {
      mid: { x: x + w / 2, y },
      d: distPointToSegment(p, { x, y }, { x: x + w, y }),
    },
    {
      mid: { x: x + w / 2, y: y + h },
      d: distPointToSegment(p, { x, y: y + h }, { x: x + w, y: y + h }),
    },
  ];
  edges.sort((a, b) => a.d - b.d);
  return edges[0].mid;
}

function StageCard({
  cardId,
  accentVar,
  badge,
  label,
  showEventCount,
  eventsCount,
  beatState,
  widthPx,
  leftPct,
  topPct,
  bounds,
  onMove,
  onChangeBeatState,
}: {
  cardId: string;
  /** CSS custom property name without `var()`, e.g. `--accent-you` */
  accentVar: string;
  badge: string;
  label: string;
  showEventCount: boolean;
  eventsCount: number;
  beatState: StageBeatState;
  widthPx: number;
  leftPct: number;
  topPct: number;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    rectW: number;
    rectH: number;
    currentPx: { x: number; y: number };
  };
  onMove: (pos01: { x: number; y: number }) => void;
  onChangeBeatState: (next: StageBeatState) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
   
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const menuRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const dragState = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
  } | null>(null);

  const { beatOptions, activeBeatIndex } = beatState;
  const currentText = beatOptions[activeBeatIndex] ?? "";

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (t && menuRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    queueMicrotask(() => taRef.current?.focus());
  }, [expanded, activeBeatIndex]);

  function removeBeatOption(index: number) {
    if (beatOptions.length <= 1) {
      onChangeBeatState({ beatOptions: [""], activeBeatIndex: 0 });
      return;
    }
    const next = beatOptions.filter((_, j) => j !== index);
    const safe = next.length > 0 ? next : [""];
    let idx = activeBeatIndex;
    if (index === activeBeatIndex) {
      idx = Math.max(0, index - 1);
    } else if (index < activeBeatIndex) {
      idx = activeBeatIndex - 1;
    }
    idx = Math.min(idx, safe.length - 1);
    onChangeBeatState({ beatOptions: safe, activeBeatIndex: Math.max(0, idx) });
  }

  function patchActiveText(value: string) {
    const next = [...beatOptions];
    next[activeBeatIndex] = value;
    onChangeBeatState({ beatOptions: next, activeBeatIndex });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = currentText.trim();
      if (!trimmed) return;
      const next = [...beatOptions];
      next[activeBeatIndex] = trimmed;
      if (activeBeatIndex + 1 < next.length && next[activeBeatIndex + 1] === "") {
        onChangeBeatState({ beatOptions: next, activeBeatIndex: activeBeatIndex + 1 });
      } else {
        next.splice(activeBeatIndex + 1, 0, "");
        onChangeBeatState({ beatOptions: next, activeBeatIndex: activeBeatIndex + 1 });
      }
      queueMicrotask(() => taRef.current?.focus());
    }
  }

  const showBeatMenu = beatOptions.length > 1;

  return (
    <div
      className="absolute select-none"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: "translate(-50%, -50%)",
        width: `${widthPx}px`,
      }}
    >
      <div
        className={[
          "rounded-2xl border p-3 shadow-sm backdrop-blur-sm",
          dragging ? "cursor-grabbing" : "cursor-grab",
        ].join(" ")}
        style={{
          background: "var(--card-surface)",
          borderColor: "var(--card-border)",
          borderLeftWidth: 3,
          borderLeftStyle: "solid",
          borderLeftColor: `var(${accentVar})`,
        }}
        onPointerDown={(e) => {
          const target = e.target as HTMLElement | null;
          if (
            target?.closest("button, textarea, input, ul[role='listbox'], [role='option']")
          ) {
            return;
          }
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          setDragging(true);
          dragState.current = {
            startX: e.clientX,
            startY: e.clientY,
            baseX: bounds.currentPx.x,
            baseY: bounds.currentPx.y,
          };
        }}
        onPointerMove={(e) => {
          if (!dragState.current) return;
          const dx = e.clientX - dragState.current.startX;
          const dy = e.clientY - dragState.current.startY;
          const nextPx = {
            x: dragState.current.baseX + dx,
            y: dragState.current.baseY + dy,
          };
          const nextClamped = {
            x: Math.min(bounds.maxX, Math.max(bounds.minX, nextPx.x)),
            y: Math.min(bounds.maxY, Math.max(bounds.minY, nextPx.y)),
          };
          onMove({
            x: clamp01(nextClamped.x / bounds.rectW),
            y: clamp01(nextClamped.y / bounds.rectH),
          });
        }}
        onPointerUp={() => {
          dragState.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          dragState.current = null;
          setDragging(false);
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-[color:var(--foreground)]">
              {label}
            </div>
            {showEventCount ? (
              <div className="mt-0.5 text-[11px] text-[color:var(--foreground)]/60">
                {eventsCount} event{eventsCount === 1 ? "" : "s"}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)] p-1 text-[color:var(--foreground)] hover:bg-[var(--ui-accent-muted)]/25"
              aria-label="Expand editor"
              title="Larger editor"
              onClick={() => {
                setMenuOpen(false);
                setExpanded(true);
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
            <div
              className="text-[10px] font-medium"
              style={{ color: `var(${accentVar})` }}
            >
              {badge}
            </div>
          </div>
        </div>

        {!expanded && showBeatMenu ? (
          <div
            ref={menuRef}
            className="relative z-30 mt-1.5"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-2 py-1.5 text-left text-[10px] font-medium text-[color:var(--foreground)]/85 hover:bg-[var(--ui-accent-muted)]/20"
              style={{
                borderLeftWidth: 3,
                borderLeftColor: `var(${accentVar})`,
              }}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <span className="min-w-0 truncate">
                {activeBeatIndex + 1} / {beatOptions.length} ·{" "}
                {beatMenuPreview(currentText, activeBeatIndex)}
              </span>
              <span className="shrink-0 opacity-60" aria-hidden>
                {menuOpen ? "▴" : "▾"}
              </span>
            </button>
            {menuOpen ? (
              <ul
                className="absolute left-0 right-0 top-full z-20 mt-0.5 max-h-44 overflow-auto rounded-lg border border-[color:var(--card-border)] bg-[var(--card-surface)] py-1 shadow-lg backdrop-blur-md"
                role="listbox"
                aria-label={`Beat options for ${label}`}
              >
                {beatOptions.map((opt, i) => (
                  <li key={i} role="none" className="flex items-start gap-0.5 pr-1">
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === activeBeatIndex}
                      className={[
                        "flex min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-left text-[10px] leading-snug hover:bg-[var(--ui-accent-muted)]/25",
                        i === activeBeatIndex ? "bg-[var(--ui-accent-muted)]/30 font-semibold" : "",
                      ].join(" ")}
                      onClick={() => {
                        onChangeBeatState({ beatOptions: [...beatOptions], activeBeatIndex: i });
                        setMenuOpen(false);
                        queueMicrotask(() => taRef.current?.focus());
                      }}
                    >
                      <span
                        className="mt-0.5 inline-flex h-4 min-w-5 items-center justify-center rounded bg-[var(--hole-fill)] text-[9px] tabular-nums"
                        style={{ color: `var(${accentVar})` }}
                      >
                        {i + 1}
                      </span>
                      <span className="min-w-0 whitespace-pre-wrap break-words">
                        {opt.trim() ? opt : "(empty)"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="mt-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] text-[color:var(--foreground)]/45 hover:bg-red-500/15 hover:text-red-600 dark:hover:text-red-400"
                      aria-label={`Remove option ${i + 1}`}
                      title="Remove this option"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeBeatOption(i);
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {!expanded ? (
          <textarea
            ref={taRef}
            value={currentText}
            onChange={(e) => patchActiveText(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Main beat… Enter = new option. Shift+Enter = newline."
            className="mt-2 min-h-[72px] w-full resize-none rounded-xl border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-2 py-2 text-xs outline-none focus:border-[color:var(--ui-accent)]"
          />
        ) : (
          <p className="mt-2 text-center text-[10px] opacity-50">Editing in expanded view…</p>
        )}
      </div>

      {mounted && expanded
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`expand-title-${cardId}`}
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
                aria-label="Close expanded editor"
                onClick={() => setExpanded(false)}
              />
              <div
                className="relative z-10 flex max-h-[min(90dvh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)] shadow-2xl"
                style={{ borderLeftWidth: 4, borderLeftColor: `var(${accentVar})` }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-[color:var(--card-border)] px-4 py-3">
                  <div className="min-w-0">
                    <h2 id={`expand-title-${cardId}`} className="text-sm font-semibold">
                      {label}
                    </h2>
                    <p className="mt-0.5 text-[11px] opacity-60">
                      {badge}
                      {showEventCount
                        ? ` · ${eventsCount} event${eventsCount === 1 ? "" : "s"}`
                        : " · Hero's journey"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-[color:var(--card-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--ui-accent-muted)]/25"
                    onClick={() => setExpanded(false)}
                  >
                    Done
                  </button>
                </div>

                {showBeatMenu ? (
                  <div ref={menuRef} className="relative z-30 border-b border-[color:var(--card-border)] px-4 py-2">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-3 py-2 text-left text-xs font-medium hover:bg-[var(--ui-accent-muted)]/20"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuOpen((o) => !o)}
                    >
                      <span className="min-w-0 truncate">
                        {activeBeatIndex + 1} / {beatOptions.length} ·{" "}
                        {beatMenuPreview(currentText, activeBeatIndex)}
                      </span>
                      <span className="shrink-0 opacity-60">{menuOpen ? "▴" : "▾"}</span>
                    </button>
                    {menuOpen ? (
                      <ul
                        className="absolute left-4 right-4 top-full z-20 mt-1 max-h-40 overflow-auto rounded-lg border border-[color:var(--card-border)] bg-[var(--card-surface)] py-1 shadow-lg"
                        role="listbox"
                      >
                        {beatOptions.map((opt, i) => (
                          <li key={i} className="flex items-start gap-0.5 pr-1" role="none">
                            <button
                              type="button"
                              role="option"
                              className={[
                                "flex min-w-0 flex-1 items-start gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--ui-accent-muted)]/25",
                                i === activeBeatIndex ? "bg-[var(--ui-accent-muted)]/30 font-semibold" : "",
                              ].join(" ")}
                              onClick={() => {
                                onChangeBeatState({
                                  beatOptions: [...beatOptions],
                                  activeBeatIndex: i,
                                });
                                setMenuOpen(false);
                                queueMicrotask(() => taRef.current?.focus());
                              }}
                            >
                              <span
                                className="mt-0.5 tabular-nums"
                                style={{ color: `var(${accentVar})` }}
                              >
                                {i + 1}.
                              </span>
                              <span className="min-w-0 whitespace-pre-wrap break-words">
                                {opt.trim() ? opt : "(empty)"}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="mt-2 shrink-0 rounded px-2 py-0.5 text-xs opacity-50 hover:bg-red-500/15 hover:opacity-100"
                              aria-label={`Remove option ${i + 1}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeBeatOption(i);
                              }}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <div className="min-h-0 flex-1 overflow-auto p-4">
                  <textarea
                    ref={taRef}
                    value={currentText}
                    onChange={(e) => patchActiveText(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Write this beat in detail… Enter = new option. Shift+Enter = newline."
                    className="h-[min(50dvh,420px)] min-h-[200px] w-full resize-y rounded-xl border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-3 py-3 text-sm leading-relaxed outline-none focus:border-[color:var(--ui-accent)]"
                  />
                  <p className="mt-2 text-[11px] opacity-50">
                    Escape or Done to return to the circle. Changes save automatically.
                  </p>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function polar(cx: number, cy: number, r: number, angleRad: number) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy + r * Math.sin(angleRad),
  };
}

function donutWedgePath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  a0: number,
  a1: number,
) {
  const p0 = polar(cx, cy, rOuter, a0);
  const p1 = polar(cx, cy, rOuter, a1);
  const p2 = polar(cx, cy, rInner, a1);
  const p3 = polar(cx, cy, rInner, a0);
  const largeArc = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p3.x} ${p3.y}`,
    "Z",
  ].join(" ");
}

function StoryCircleDiagram({
  buckets,
  stageBeatStates,
  onChangeStageBeats,
  cardPos,
  onChangeCardPos,
}: {
  buckets: StageBuckets;
  stageBeatStates: Record<StoryStage, StageBeatState>;
  onChangeStageBeats: (stage: StoryStage, next: StageBeatState) => void;
  cardPos: StageCardPos;
  onChangeCardPos: (stage: StoryStage, pos: { x: number; y: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setRect({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // One coordinate system = container pixels. SVG viewBox matches rect so lines + cards align.
  const w = Math.max(1, rect.w);
  const h = Math.max(1, rect.h);
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);
  const rOuter = minDim * 0.29;
  const rInner = minDim * 0.2;
  const rimPadding = minDim * 0.006; // start lines just outside donut
  const defaultCardRadius = rOuter + minDim * 0.26;
  const rHole = Math.max(rInner - minDim * 0.01, 1); // radio del agujero interior
  const stageLabelFont = Math.max(10, Math.round(minDim * 0.022));
  const stageCountFont = Math.max(8, Math.round(minDim * 0.017));
  const axisLabelFont = Math.max(7, Math.round(minDim * 0.013));
  const start = -Math.PI / 2;
  const step = (2 * Math.PI) / STORY_STAGES.length;

  function layoutForStage(stage: StoryStage, index: number) {
    const aMid = start + (index + 0.5) * step;
    const saved = cardPos[stage];
    const idealCenter = saved
      ? { x: saved.x * w, y: saved.y * h }
      : polar(cx, cy, defaultCardRadius, aMid);
    const cardWpx = Math.max(220, Math.min(320, w * 0.22));
    const cardHpx = Math.max(130, Math.min(190, h * 0.18));
    const padPx = 12;
    const minX = padPx + cardWpx / 2;
    const maxX = w - padPx - cardWpx / 2;
    const minY = padPx + cardHpx / 2;
    const maxY = h - padPx - cardHpx / 2;
    const clampedPx = {
      x: Math.min(maxX, Math.max(minX, idealCenter.x)),
      y: Math.min(maxY, Math.max(minY, idealCenter.y)),
    };
    return {
      aMid,
      clampedPx,
      cardWpx,
      cardHpx,
      minX,
      maxX,
      minY,
      maxY,
    };
  }

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 w-full overflow-hidden"
    >
      <div className="absolute inset-0">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="Story Circle"
          >
            <defs>
              <radialGradient id="ringGlow" cx="50%" cy="50%" r="60%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.0)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.05)" />
              </radialGradient>
            </defs>

            {/* ring */}
            {STORY_STAGES.map((stage, i) => {
              const a0 = start + i * step;
              const a1 = a0 + step;
              const path = donutWedgePath(cx, cy, rOuter, rInner, a0, a1);
              return (
                <path
                  key={stage}
                  d={path}
                  fill={`var(--ring-${stage.toLowerCase()}-fill)`}
                  stroke={`var(--ring-${stage.toLowerCase()}-stroke)`}
                  strokeWidth={Math.max(1, minDim * 0.0015)}
                />
              );
            })}

            {/* center */}
            <circle
              cx={cx}
              cy={cy}
              r={rHole}
              fill="var(--hole-fill)"
              stroke="var(--card-border)"
              strokeWidth={Math.max(1, minDim * 0.0012)}
            />
            {/* Order (top) / Chaos (bottom) */}
            <line
              x1={cx - rHole}
              y1={cy}
              x2={cx + rHole}
              y2={cy}
              stroke="var(--axis-line)"
              strokeWidth={Math.max(1, minDim * 0.0025)}
              strokeDasharray={`${Math.round(minDim * 0.014)} ${Math.round(minDim * 0.01)}`}
              strokeLinecap="round"
              opacity={0.85}
            />
            <text
              x={cx}
              y={cy - rHole * 0.34}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--order-tone)"
              style={{
                fontSize: axisLabelFont,
                fontWeight: 600,
                textRendering: "geometricPrecision",
              }}
            >
              Order
            </text>
            <text
              x={cx}
              y={cy + rHole * 0.34}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--chaos-tone)"
              style={{
                fontSize: axisLabelFont,
                fontWeight: 600,
                textRendering: "geometricPrecision",
              }}
            >
              Chaos
            </text>
            <circle cx={cx} cy={cy} r={rOuter} fill="url(#ringGlow)" opacity={0.8} />

            {/* Stage labels (no event dots) */}
            {STORY_STAGES.map((stage, i) => {
              const aMid = start + (i + 0.5) * step;
              const labelPos = polar(cx, cy, (rOuter + rInner) / 2, aMid);
              const events = buckets[stage] ?? [];

              return (
                <g key={`${stage}-label`}>
                  <text
                    x={Math.round(labelPos.x * 2) / 2}
                    y={Math.round(labelPos.y * 2) / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="select-none font-semibold"
                    fill={`var(${stageAccentVar(stage)})`}
                    style={{
                      fontSize: stageLabelFont,
                      textRendering: "geometricPrecision",
                    }}
                  >
                    {stage}
                  </text>
                  <text
                    x={Math.round(labelPos.x * 2) / 2}
                    y={Math.round(labelPos.y * 2) / 2 + stageLabelFont * 0.85 + 4}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="select-none"
                    fill="var(--foreground)"
                    opacity={0.5}
                    style={{
                      fontSize: stageCountFont,
                      textRendering: "geometricPrecision",
                    }}
                  >
                    {events.length}
                  </text>
                </g>
              );
            })}

            {/* leader lines to cards (smart) — same pixel space as HTML cards */}
            {STORY_STAGES.map((stage, i) => {
              const { aMid, clampedPx, cardWpx, cardHpx } = layoutForStage(stage, i);
              const pFrom = polar(cx, cy, rOuter + rimPadding, aMid);
              const rectCard = {
                x: clampedPx.x - cardWpx / 2,
                y: clampedPx.y - cardHpx / 2,
                w: cardWpx,
                h: cardHpx,
              };
              const pTo = midpointOfClosestCardEdge(rectCard, pFrom);
              const sw = Math.max(1.5, minDim * 0.0035);
              return (
                <path
                  key={`${stage}-leader`}
                  d={`M ${pFrom.x} ${pFrom.y} L ${pTo.x} ${pTo.y}`}
                  stroke={`var(${stageAccentVar(stage)})`}
                  strokeWidth={sw}
                  strokeLinecap="round"
                  fill="none"
                  opacity={0.38}
                />
              );
            })}
          </svg>

          {/* Cards around the ring */}
          {STORY_STAGES.map((stage, i) => {
            const { clampedPx, cardWpx, cardHpx, minX, maxX, minY, maxY } =
              layoutForStage(stage, i);

            return (
              <StageCard
                key={`${stage}-card`}
                cardId={stage}
                accentVar={stageAccentVar(stage)}
                badge={stage}
                label={STORY_STAGE_LABELS[stage]}
                showEventCount
                eventsCount={buckets[stage]?.length ?? 0}
                beatState={stageBeatStates[stage] ?? emptyBeatState()}
                widthPx={cardWpx}
                leftPct={(clampedPx.x / w) * 100}
                topPct={(clampedPx.y / h) * 100}
                bounds={{
                  minX,
                  maxX,
                  minY,
                  maxY,
                  rectW: w,
                  rectH: h,
                  currentPx: clampedPx,
                }}
                onMove={(pos01) => onChangeCardPos(stage, pos01)}
                onChangeBeatState={(next) => onChangeStageBeats(stage, next)}
              />
            );
          })}
      </div>
    </div>
  );
}

function HeroesJourneyDiagram({
  hjBeatStates,
  onChangeHjBeats,
  hjCardPos,
  onChangeHjCardPos,
}: {
  hjBeatStates: Record<number, StageBeatState>;
  onChangeHjBeats: (step: number, next: StageBeatState) => void;
  hjCardPos: HjCardPos;
  onChangeHjCardPos: (step: number, pos: { x: number; y: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      setRect({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const w = Math.max(1, rect.w);
  const h = Math.max(1, rect.h);
  const cx = w / 2;
  const cy = h / 2;
  const minDim = Math.min(w, h);
  const rOuter = minDim * 0.29;
  const rInner = minDim * 0.2;
  const rimPadding = minDim * 0.006;
  const defaultCardRadius = rOuter + minDim * 0.26;
  const rHole = Math.max(rInner - minDim * 0.01, 1);
  const stageLabelFont = Math.max(7, Math.round(minDim * 0.014));
  const stepNumFont = Math.max(7, Math.round(minDim * 0.012));
  const axisLabelFont = Math.max(7, Math.round(minDim * 0.013));
  const hjTitleFont = Math.max(9, Math.round(minDim * 0.016));
  const start = -Math.PI / 2;
  const stepAngle = (2 * Math.PI) / HERO_JOURNEY_STEPS.length;

  function layoutForStep(step: number, index: number) {
    const aMid = start + (index + 0.5) * stepAngle;
    const saved = hjCardPos[step];
    const idealCenter = saved
      ? { x: saved.x * w, y: saved.y * h }
      : polar(cx, cy, defaultCardRadius, aMid);
    const cardWpx = Math.max(180, Math.min(280, w * 0.19));
    const cardHpx = Math.max(120, Math.min(170, h * 0.16));
    const padPx = 10;
    const minX = padPx + cardWpx / 2;
    const maxX = w - padPx - cardWpx / 2;
    const minY = padPx + cardHpx / 2;
    const maxY = h - padPx - cardHpx / 2;
    const clampedPx = {
      x: Math.min(maxX, Math.max(minX, idealCenter.x)),
      y: Math.min(maxY, Math.max(minY, idealCenter.y)),
    };
    return { aMid, clampedPx, cardWpx, cardHpx, minX, maxX, minY, maxY };
  }

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 w-full overflow-hidden"
    >
      <div className="absolute inset-0">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label="The Hero's Journey diagram"
        >
          <defs>
            <radialGradient id="hjRingGlow" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.05)" />
            </radialGradient>
          </defs>

          {HERO_JOURNEY_STEPS.map((def, i) => {
            const a0 = start + i * stepAngle;
            const a1 = a0 + stepAngle;
            const path = donutWedgePath(cx, cy, rOuter, rInner, a0, a1);
            return (
              <path
                key={def.step}
                d={path}
                fill={`var(${hjActRingFillVar(def.act)})`}
                stroke={`var(${hjActRingStrokeVar(def.act)})`}
                strokeWidth={Math.max(1, minDim * 0.0015)}
              />
            );
          })}

          <circle
            cx={cx}
            cy={cy}
            r={rHole}
            fill="var(--hole-fill)"
            stroke="var(--card-border)"
            strokeWidth={Math.max(1, minDim * 0.0012)}
          />
          <line
            x1={cx - rHole}
            y1={cy}
            x2={cx + rHole}
            y2={cy}
            stroke="var(--axis-line)"
            strokeWidth={Math.max(1, minDim * 0.0025)}
            strokeDasharray={`${Math.round(minDim * 0.014)} ${Math.round(minDim * 0.01)}`}
            strokeLinecap="round"
            opacity={0.85}
          />
          <text
            x={cx}
            y={cy - rHole * 0.38}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--order-tone)"
            style={{
              fontSize: axisLabelFont,
              fontWeight: 600,
              textRendering: "geometricPrecision",
            }}
          >
            Known
          </text>
          <text
            x={cx}
            y={cy + rHole * 0.34}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--chaos-tone)"
            style={{
              fontSize: axisLabelFont,
              fontWeight: 600,
              textRendering: "geometricPrecision",
            }}
          >
            Unknown
          </text>
          <text
            x={cx}
            y={cy - rHole * 0.08}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="var(--foreground)"
            opacity={0.88}
            style={{
              fontSize: hjTitleFont,
              fontWeight: 700,
              textRendering: "geometricPrecision",
            }}
          >
            The Hero&apos;s Journey
          </text>
          <circle cx={cx} cy={cy} r={rOuter} fill="url(#hjRingGlow)" opacity={0.8} />

          {HERO_JOURNEY_STEPS.map((def, i) => {
            const aMid = start + (i + 0.5) * stepAngle;
            const labelPos = polar(cx, cy, (rOuter + rInner) / 2, aMid);
            return (
              <g key={`hj-label-${def.step}`}>
                <text
                  x={Math.round(labelPos.x * 2) / 2}
                  y={Math.round(labelPos.y * 2) / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="select-none font-semibold"
                  fill={`var(${hjActAccentVar(def.act)})`}
                  style={{
                    fontSize: stageLabelFont,
                    textRendering: "geometricPrecision",
                  }}
                >
                  {def.ringLabel}
                </text>
                <text
                  x={Math.round(labelPos.x * 2) / 2}
                  y={Math.round(labelPos.y * 2) / 2 + stageLabelFont * 0.85 + 3}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="select-none"
                  fill="var(--foreground)"
                  opacity={0.45}
                  style={{
                    fontSize: stepNumFont,
                    textRendering: "geometricPrecision",
                  }}
                >
                  {def.step}
                </text>
              </g>
            );
          })}

          {HERO_JOURNEY_STEPS.map((def, i) => {
            const { aMid, clampedPx, cardWpx, cardHpx } = layoutForStep(def.step, i);
            const pFrom = polar(cx, cy, rOuter + rimPadding, aMid);
            const rectCard = {
              x: clampedPx.x - cardWpx / 2,
              y: clampedPx.y - cardHpx / 2,
              w: cardWpx,
              h: cardHpx,
            };
            const pTo = midpointOfClosestCardEdge(rectCard, pFrom);
            const sw = Math.max(1.5, minDim * 0.0035);
            return (
              <path
                key={`hj-leader-${def.step}`}
                d={`M ${pFrom.x} ${pFrom.y} L ${pTo.x} ${pTo.y}`}
                stroke={`var(${hjActAccentVar(def.act)})`}
                strokeWidth={sw}
                strokeLinecap="round"
                fill="none"
                opacity={0.38}
              />
            );
          })}
        </svg>

        {HERO_JOURNEY_STEPS.map((def, i) => {
          const { clampedPx, cardWpx, cardHpx, minX, maxX, minY, maxY } = layoutForStep(
            def.step,
            i,
          );
          return (
            <StageCard
              key={`hj-${def.step}-card`}
              cardId={`hj-${def.step}`}
              accentVar={hjActAccentVar(def.act)}
              badge={String(def.step)}
              label={def.title}
              showEventCount={false}
              eventsCount={0}
              beatState={hjBeatStates[def.step] ?? emptyBeatState()}
              widthPx={cardWpx}
              leftPct={(clampedPx.x / w) * 100}
              topPct={(clampedPx.y / h) * 100}
              bounds={{
                minX,
                maxX,
                minY,
                maxY,
                rectW: w,
                rectH: h,
                currentPx: clampedPx,
              }}
              onMove={(pos01) => onChangeHjCardPos(def.step, pos01)}
              onChangeBeatState={(next) => onChangeHjBeats(def.step, next)}
            />
          );
        })}
      </div>
    </div>
  );
}

function emptyBuckets(): StageBuckets {
  return {
    You: [],
    Need: [],
    Go: [],
    Search: [],
    Find: [],
    Take: [],
    Return: [],
    Change: [],
  };
}

function bucketize(events: StoryEvent[]): StageBuckets {
  const b = emptyBuckets();
  for (const e of events) b[e.stage].push(e);
  for (const stage of STORY_STAGES) {
    b[stage] = [...b[stage]].sort((a, z) => a.orderInStage - z.orderInStage);
  }
  return b;
}

function StageColumn({
  stage,
  events,
  onCreate,
  children,
}: {
  stage: StoryStage;
  events: StoryEvent[];
  onCreate: (stage: StoryStage, title: string) => void;
  children: React.ReactNode;
}) {
  const [title, setTitle] = useState("");
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
    data: { type: "stage", stage },
  });
  return (
    <section
      ref={setNodeRef}
      className={[
        "flex min-w-[260px] flex-1 flex-col rounded-2xl border p-3 shadow-sm backdrop-blur-sm",
        isOver ? "ring-2 ring-[color:var(--ui-accent)] ring-offset-2 ring-offset-[var(--background)]" : "",
      ].join(" ")}
      style={{
        background: "var(--card-surface)",
        borderColor: "var(--card-border)",
        borderLeftWidth: 3,
        borderLeftStyle: "solid",
        borderLeftColor: `var(${stageAccentVar(stage)})`,
      }}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-[color:var(--foreground)]">
            {STORY_STAGE_LABELS[stage]}
          </div>
          <div className="mt-0.5 text-[11px] text-[color:var(--foreground)]/60">
            {events.length} event{events.length === 1 ? "" : "s"}
          </div>
        </div>
      </header>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const t = title.trim();
          if (!t) return;
          onCreate(stage, t);
          setTitle("");
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New event…"
          className="h-9 flex-1 rounded-xl border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-3 text-xs outline-none focus:border-[color:var(--ui-accent)]"
        />
        <button
          className="h-9 rounded-xl px-3 text-xs font-medium text-[var(--ui-accent-contrast)] hover:opacity-95"
          style={{ background: "var(--ui-accent)" }}
          type="submit"
        >
          +
        </button>
      </form>

      <div className="mt-3 flex flex-1 flex-col gap-2">{children}</div>
    </section>
  );
}

function EventCard({
  event,
  onDelete,
  onSave,
}: {
  event: StoryEvent;
  onDelete: (id: string) => void;
  onSave: (id: string, patch: Partial<Pick<StoryEvent, "title" | "description">>) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: event.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    borderLeftWidth: 3,
    borderLeftStyle: "solid",
    borderLeftColor: `var(${stageAccentVar(event.stage)})`,
  };

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? "");

  useEffect(() => {
    setTitle(event.title);
    setDescription(event.description ?? "");
  }, [event.id, event.title, event.description]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        "rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)] p-3 shadow-sm backdrop-blur-sm",
        isDragging ? "opacity-50" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          className="min-w-0 flex-1 text-left"
          type="button"
          {...attributes}
          {...listeners}
        >
          {editing ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 w-full rounded-xl border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-2 text-xs font-semibold outline-none focus:border-[color:var(--ui-accent)]"
            />
          ) : (
            <div className="truncate text-xs font-semibold">{event.title}</div>
          )}
        </button>
        <div className="flex shrink-0 gap-1">
          <button
            className="rounded-xl border border-[color:var(--card-border)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--ui-accent-muted)]/40"
            type="button"
            onClick={() => {
              if (!editing) setEditing(true);
              else {
                onSave(event.id, { title: title.trim() || "Event", description });
                setEditing(false);
              }
            }}
          >
            {editing ? "Save" : "Edit"}
          </button>
          <button
            className="rounded-xl border border-[color:var(--card-border)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--ui-accent-muted)]/40"
            type="button"
            onClick={() => onDelete(event.id)}
          >
            Delete
          </button>
        </div>
      </div>

      {editing ? (
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Notes…"
          className="mt-2 min-h-16 w-full resize-y rounded-xl border border-[color:var(--card-border)] bg-[var(--hole-fill)] px-2 py-2 text-xs outline-none focus:border-[color:var(--ui-accent)]"
        />
      ) : event.description ? (
        <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-[color:var(--foreground)]/70">
          {event.description}
        </div>
      ) : null}
    </div>
  );
}

export default function StoryCirclePage({
}: {}) {
  const params = useParams<{ id?: string | string[] }>();
  const projectId = Array.isArray(params?.id) ? params?.id[0] : params?.id;
  const [buckets, setBuckets] = useState<StageBuckets>(() => emptyBuckets());
  const [activeEvent, setActiveEvent] = useState<StoryEvent | null>(null);
  const [stageBeatStates, setStageBeatStates] = useState<Record<StoryStage, StageBeatState>>(
    () => defaultBeatStates(),
  );
  const [cardPos, setCardPos] = useState<StageCardPos>(() => ({
    You: null,
    Need: null,
    Go: null,
    Search: null,
    Find: null,
    Take: null,
    Return: null,
    Change: null,
  }));
  const [hjBeatStates, setHjBeatStates] = useState<Record<number, StageBeatState>>(
    () => defaultHjBeatStates(),
  );
  const [hjCardPos, setHjCardPos] = useState<HjCardPos>(() => defaultHjCardPos());
  const [diagramVariant, setDiagramVariant] = useState<CircleDiagramVariant>("story-circle");

  useEffect(() => {
    try {
      const v = localStorage.getItem(CIRCLE_DIAGRAM_VARIANT_STORAGE_KEY);
      if (v === "heroes-journey" || v === "story-circle") setDiagramVariant(v);
    } catch {
      /* ignore */
    }
  }, []);

  function persistDiagramVariant(next: CircleDiagramVariant) {
    setDiagramVariant(next);
    try {
      localStorage.setItem(CIRCLE_DIAGRAM_VARIANT_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const [evts, notes, hjNotes] = await Promise.all([
        listEventsForProject(projectId),
        listStageNotes(projectId),
        listHeroJourneyNotes(projectId),
      ]);
      if (cancelled) return;
      setBuckets(bucketize(evts));
      setStageBeatStates(() => {
        const next = defaultBeatStates();
        for (const n of notes) {
          next[n.stage] = stageNoteBeatState(n);
        }
        return next;
      });
      setCardPos((prev) => {
        const next = { ...prev };
        for (const n of notes) {
          if (typeof n.cardX === "number" && typeof n.cardY === "number") {
            next[n.stage] = { x: n.cardX, y: n.cardY };
          }
        }
        return next;
      });
      setHjBeatStates(() => {
        const next = defaultHjBeatStates();
        for (const n of hjNotes) {
          if (n.step >= 1 && n.step <= 12) {
            next[n.step] = heroJourneyNoteBeatState(n);
          }
        }
        return next;
      });
      setHjCardPos(() => {
        const next = defaultHjCardPos();
        for (const n of hjNotes) {
          if (
            n.step >= 1 &&
            n.step <= 12 &&
            typeof n.cardX === "number" &&
            typeof n.cardY === "number"
          ) {
            next[n.step] = { x: n.cardX, y: n.cardY };
          }
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // debounce save for stage notes
  useEffect(() => {
    if (!projectId) return;
    const t = setTimeout(() => {
      void (async () => {
        for (const stage of STORY_STAGES) {
          const bs = stageBeatStates[stage] ?? emptyBeatState();
          const pos = cardPos[stage];
          await upsertStageNote({
            projectId,
            stage,
            beatOptions: bs.beatOptions,
            activeBeatIndex: bs.activeBeatIndex,
            cardX: pos?.x ?? null,
            cardY: pos?.y ?? null,
          });
        }
      })();
    }, 500);
    return () => clearTimeout(t);
  }, [projectId, stageBeatStates, cardPos]);

  useEffect(() => {
    if (!projectId) return;
    const t = setTimeout(() => {
      void (async () => {
        for (const def of HERO_JOURNEY_STEPS) {
          const step = def.step;
          const bs = hjBeatStates[step] ?? emptyBeatState();
          const pos = hjCardPos[step];
          await upsertHeroJourneyNote({
            projectId,
            step,
            beatOptions: bs.beatOptions,
            activeBeatIndex: bs.activeBeatIndex,
            cardX: pos?.x ?? null,
            cardY: pos?.y ?? null,
          });
        }
      })();
    }, 500);
    return () => clearTimeout(t);
  }, [projectId, hjBeatStates, hjCardPos]);

  const allEvents = useMemo(() => {
    const out: StoryEvent[] = [];
    for (const stage of STORY_STAGES) out.push(...buckets[stage]);
    return out;
  }, [buckets]);

  async function persistAll(nextBuckets: StageBuckets) {
    const flattened: StoryEvent[] = [];
    for (const stage of STORY_STAGES) {
      const stageEvents = nextBuckets[stage].map((e, idx) => ({
        ...e,
        stage,
        orderInStage: idx,
      }));
      flattened.push(...stageEvents);
    }
    await bulkUpdateEvents(flattened);
  }

  function findStageByEventId(id: string): StoryStage | null {
    for (const stage of STORY_STAGES) {
      if (buckets[stage].some((e) => e.id === id)) return stage;
    }
    return null;
  }

  // Event drag handlers are currently unused (board UI removed).

  async function onCreate(stage: StoryStage, title: string) {
    if (!projectId) return;
    const evt = await createEvent({ projectId, stage, title });
    setBuckets((prev) => {
      const next = { ...prev };
      next[stage] = [...next[stage], evt];
      return next;
    });
  }

  async function onDelete(eventId: string) {
    await deleteEvent(eventId);
    setBuckets((prev) => {
      const next = emptyBuckets();
      for (const stage of STORY_STAGES) {
        next[stage] = prev[stage].filter((e) => e.id !== eventId);
      }
      return next;
    });
  }

  async function onSave(
    eventId: string,
    patch: Partial<Pick<StoryEvent, "title" | "description">>,
  ) {
    await updateEvent(eventId, patch);
    setBuckets((prev) => {
      const next = { ...prev };
      for (const stage of STORY_STAGES) {
        next[stage] = next[stage].map((e) => (e.id === eventId ? { ...e, ...patch } : e));
      }
      return next;
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent text-[color:var(--foreground)]">
      <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        {!projectId ? (
          <div className="m-4 rounded-2xl border border-dashed border-[color:var(--card-border)] bg-[var(--card-surface)] p-8 text-sm">
            Missing project id in the URL.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--card-border)]/50 bg-[var(--card-surface)]/80 px-3 py-2 backdrop-blur-md">
              <span className="text-xs font-medium opacity-70">Diagram</span>
              <div
                className="flex rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)] p-0.5"
                role="group"
                aria-label="Circle diagram type"
              >
                <button
                  type="button"
                  className={[
                    "rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
                    diagramVariant === "story-circle"
                      ? "bg-[var(--ui-accent-muted)]/40 text-[color:var(--foreground)]"
                      : "text-[color:var(--foreground)]/65 hover:bg-[var(--ui-accent-muted)]/20",
                  ].join(" ")}
                  onClick={() => persistDiagramVariant("story-circle")}
                >
                  Story circle
                </button>
                <button
                  type="button"
                  className={[
                    "rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors",
                    diagramVariant === "heroes-journey"
                      ? "bg-[var(--ui-accent-muted)]/40 text-[color:var(--foreground)]"
                      : "text-[color:var(--foreground)]/65 hover:bg-[var(--ui-accent-muted)]/20",
                  ].join(" ")}
                  onClick={() => persistDiagramVariant("heroes-journey")}
                >
                  Hero&apos;s journey
                </button>
              </div>
              <span className="max-w-[min(100%,28rem)] text-[10px] opacity-50">
                Story Circle: 8 stages tied to events. Hero&apos;s Journey: 12 steps with its own
                notes—frameworks are separate.
              </span>
            </div>
            {diagramVariant === "heroes-journey" ? (
              <HeroesJourneyDiagram
                hjBeatStates={hjBeatStates}
                onChangeHjBeats={(step, next) =>
                  setHjBeatStates((prev) => ({ ...prev, [step]: next }))
                }
                hjCardPos={hjCardPos}
                onChangeHjCardPos={(step, pos01) =>
                  setHjCardPos((prev) => ({ ...prev, [step]: pos01 }))
                }
              />
            ) : (
              <StoryCircleDiagram
                buckets={buckets}
                stageBeatStates={stageBeatStates}
                onChangeStageBeats={(stage, next) =>
                  setStageBeatStates((prev) => ({ ...prev, [stage]: next }))
                }
                cardPos={cardPos}
                onChangeCardPos={(stage, pos01) =>
                  setCardPos((prev) => ({ ...prev, [stage]: pos01 }))
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

