"use client";

import { useEffect, useMemo, useState } from "react";

const RELATION_PRESETS = [
  { id: "custom", label: "Custom…" },
  { id: "friend", label: "Friends" },
  { id: "enemy", label: "Enemies" },
  { id: "love", label: "Romance" },
  { id: "family", label: "Family" },
  { id: "mentor", label: "Mentor / mentee" },
  { id: "boss", label: "Boss / employee" },
  { id: "ally", label: "Allies" },
];

export function RelationEditDialog({
  open,
  onOpenChange,
  fromLabel,
  toLabel,
  initialLabel,
  initialColor,
  initialDashed,
  initialArrow,
  onSave,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fromLabel: string;
  toLabel: string;
  initialLabel: string;
  initialColor?: string;
  initialDashed?: boolean;
  initialArrow?: boolean;
  onSave: (patch: { label: string; color?: string; dashed?: boolean; arrow?: boolean }) => void;
  onDelete: () => void;
}) {
  const [preset, setPreset] = useState("custom");
  const [label, setLabel] = useState(initialLabel ?? "");
  const [color, setColor] = useState(initialColor ?? "#94a3b8");
  const [dashed, setDashed] = useState(Boolean(initialDashed));
  const [arrow, setArrow] = useState(Boolean(initialArrow));

  useEffect(() => {
    if (!open) return;
    setPreset("custom");
    setLabel(initialLabel ?? "");
    setColor(initialColor ?? "#94a3b8");
    setDashed(Boolean(initialDashed));
    setArrow(Boolean(initialArrow));
  }, [open, initialLabel, initialColor, initialDashed, initialArrow]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const canSave = useMemo(() => open, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[140]">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute left-1/2 top-1/2 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)] p-4 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Edit relationship</div>
            <div className="text-[11px] opacity-60">
              {fromLabel} → {toLabel}
            </div>
          </div>
          <button
            type="button"
            className="ml-auto rounded-lg px-2 py-1 text-xs opacity-70 hover:bg-[var(--ui-accent-muted)]/25 hover:opacity-100"
            onClick={() => onOpenChange(false)}
          >
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium opacity-75">Type</span>
            <select
              value={preset}
              onChange={(e) => {
                const v = e.target.value;
                setPreset(v);
                const p = RELATION_PRESETS.find((x) => x.id === v);
                if (p && p.id !== "custom") setLabel(p.label);
              }}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
            >
              {RELATION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium opacity-75">Color</span>
            <input
              type="color"
              value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : "#94a3b8"}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-20 cursor-pointer rounded border border-[color:var(--card-border)] bg-transparent p-1"
            />
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-[11px] font-medium opacity-75">Label</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
              placeholder="e.g. Siblings / Rivalry / Partners…"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dashed} onChange={(e) => setDashed(e.target.checked)} />
            <span className="text-[13px]">Dashed</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={arrow} onChange={(e) => setArrow(e.target.checked)} />
            <span className="text-[13px]">Arrow</span>
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20"
            onClick={() => onDelete()}
          >
            Delete relationship
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[color:var(--card-border)] px-3 py-2 text-xs hover:bg-[var(--ui-accent-muted)]/25"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSave}
              className="rounded-lg bg-[color:var(--ui-accent)] px-3 py-2 text-xs font-semibold text-white disabled:opacity-45"
              onClick={() => {
                onSave({
                  label: label.trim(),
                  color,
                  dashed,
                  arrow,
                });
                onOpenChange(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

