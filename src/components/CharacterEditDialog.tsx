"use client";

import { useEffect, useMemo, useState } from "react";
import type { Character } from "@/domain/models";
import { deleteCharacter, updateCharacter } from "@/db/repos/characters";
import { ImageCropDialog } from "@/components/ImageCropDialog";

export function CharacterEditDialog({
  open,
  onOpenChange,
  character,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  character: Character;
  onSaved?: (next: Character) => void;
  onDeleted?: (id: string) => void;
}) {
  const [name, setName] = useState(character.name);
  const [role, setRole] = useState(character.role);
  const [imageUrl, setImageUrl] = useState(character.imageUrl ?? "");
  const [cropOpen, setCropOpen] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [logline, setLogline] = useState(character.logline);
  const [bio, setBio] = useState(character.bio);
  const [goal, setGoal] = useState(character.goal);
  const [flaw, setFlaw] = useState(character.flaw);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const canSave = useMemo(() => name.trim().length > 0 && !saving && !deleting, [name, saving, deleting]);

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
    setName(character.name);
    setRole(character.role);
    setImageUrl(character.imageUrl ?? "");
    setLogline(character.logline);
    setBio(character.bio);
    setGoal(character.goal);
    setFlaw(character.flaw);
  }, [open, character]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute left-1/2 top-1/2 w-[min(44rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-surface)] p-4 shadow-2xl backdrop-blur-md">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Edit character</div>
            <div className="text-[11px] opacity-60">Saved locally.</div>
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
              Change image
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
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium opacity-75">Role</span>
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
            />
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-[11px] font-medium opacity-75">Logline</span>
            <input
              value={logline}
              onChange={(e) => setLogline(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
            />
          </label>

          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-[11px] font-medium opacity-75">Bio</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="min-h-[6rem] w-full resize-y rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium opacity-75">Goal</span>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium opacity-75">Flaw</span>
            <input
              value={flaw}
              onChange={(e) => setFlaw(e.target.value)}
              className="w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--hole-fill)]/40 px-3 py-2 text-sm outline-none focus:border-[color:var(--ui-accent)]/70"
            />
          </label>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={saving || deleting}
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-45"
            onClick={async () => {
              if (saving || deleting) return;
              setDeleting(true);
              try {
                await deleteCharacter(character.id);
                onDeleted?.(character.id);
                onOpenChange(false);
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? "Deleting…" : "Delete character"}
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
              onClick={async () => {
                if (!canSave) return;
                setSaving(true);
                try {
                  const patch = {
                    name: name.trim(),
                    role: role.trim(),
                    imageUrl: imageUrl || undefined,
                    logline: logline.trim(),
                    bio: bio.trim(),
                    goal: goal.trim(),
                    flaw: flaw.trim(),
                  };
                  await updateCharacter(character.id, patch);
                  onSaved?.({ ...character, ...patch });
                  onOpenChange(false);
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
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

