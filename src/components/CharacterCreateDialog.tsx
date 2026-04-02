"use client";

import { useEffect, useMemo, useState } from "react";
import type { Character } from "@/domain/models";
import { createCharacter } from "@/db/repos/characters";
import { ImageCropDialog } from "@/components/ImageCropDialog";

export function CharacterCreateDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId: string;
  onCreated?: (c: Character) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [logline, setLogline] = useState("");
  const [bio, setBio] = useState("");
  const [goal, setGoal] = useState("");
  const [flaw, setFlaw] = useState("");
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => name.trim().length > 0 && !saving, [name, saving]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    setName("");
    setRole("");
    setImageUrl("");
    setCropOpen(false);
    setCropFile(null);
    setLogline("");
    setBio("");
    setGoal("");
    setFlaw("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Cerrar"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute left-1/2 top-1/2 w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)] p-4 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Create character</div>
            <div className="text-[11px] opacity-60">Saved locally in this project.</div>
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
          <div className="md:col-span-2 flex items-center gap-3">
            <div className="h-14 w-14 overflow-hidden rounded-xl border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] opacity-45">Photo</div>
              )}
            </div>
            <label className="cursor-pointer rounded-lg border border-[color:var(--card-border)] px-3 py-2 text-xs hover:bg-[var(--ui-accent-muted)]/25">
              Upload image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setCropFile(f);
                  setCropOpen(true);
                }}
              />
            </label>
            {imageUrl ? (
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-xs opacity-70 hover:bg-[var(--ui-accent-muted)]/25 hover:opacity-100"
                onClick={() => setImageUrl("")}
              >
                Remove
              </button>
            ) : null}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium opacity-75">Name *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
              placeholder="e.g. Ana Torres"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium opacity-75">Role</span>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
              placeholder="Protagonist / Antagonist / Mentor…"
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-[11px] font-medium opacity-75">Logline</span>
            <input
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
              placeholder="One sentence that defines them."
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-[11px] font-medium opacity-75">Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-[6rem] w-full resize-y rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
              placeholder="Backstory, context, traits…"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium opacity-75">Goal</span>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
              placeholder="What do they want?"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium opacity-75">Flaw</span>
            <input
              value={flaw}
              onChange={(e) => setFlaw(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
              placeholder="What holds them back?"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
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
            onClick={async () => {
              if (!canSave) return;
              setSaving(true);
              try {
                const created = await createCharacter({
                  projectId,
                  name,
                  role,
                  imageUrl: imageUrl || undefined,
                  logline,
                  bio,
                  goal,
                  flaw,
                });
                onCreated?.(created);
                onOpenChange(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>

      <ImageCropDialog
        open={cropOpen}
        onOpenChange={setCropOpen}
        file={cropFile}
        title="Crop portrait"
        aspect={220 / 120}
        outputWidth={880}
        onCropped={(u) => setImageUrl(u)}
      />
    </div>
  );
}

