import type { HeroJourneyNote } from "@/domain/models";
import { nowIso } from "@/domain/time";
import { db } from "../db";

function noteId(projectId: string, step: number) {
  return `${projectId}:hj:${step}`;
}

export function heroJourneyNoteBeatState(note: HeroJourneyNote): {
  beatOptions: string[];
  activeBeatIndex: number;
} {
  const beatOptions = note.beatOptions;
  let opts: string[];
  if (Array.isArray(beatOptions) && beatOptions.length > 0) {
    opts = [...beatOptions];
  } else {
    const t = (note.text ?? "").trim();
    opts = [t || ""];
  }
  let activeBeatIndex = note.activeBeatIndex ?? 0;
  if (activeBeatIndex < 0 || activeBeatIndex >= opts.length) {
    activeBeatIndex = Math.max(0, opts.length - 1);
  }
  return { beatOptions: opts, activeBeatIndex };
}

export async function listHeroJourneyNotes(projectId: string): Promise<HeroJourneyNote[]> {
  return db.heroJourneyNotes.where("projectId").equals(projectId).toArray();
}

export async function upsertHeroJourneyNote(input: {
  projectId: string;
  step: number;
  beatOptions: string[];
  activeBeatIndex: number;
  cardX?: number | null;
  cardY?: number | null;
}): Promise<void> {
  const prev = await db.heroJourneyNotes.get(noteId(input.projectId, input.step));
  let opts = [...input.beatOptions];
  if (opts.length === 0) opts = [""];
  const idx = Math.max(0, Math.min(opts.length - 1, input.activeBeatIndex));
  const text = opts[idx] ?? "";
  const note: HeroJourneyNote = {
    id: noteId(input.projectId, input.step),
    projectId: input.projectId,
    step: input.step,
    text,
    beatOptions: opts,
    activeBeatIndex: idx,
    cardX: input.cardX ?? prev?.cardX ?? null,
    cardY: input.cardY ?? prev?.cardY ?? null,
    updatedAt: nowIso(),
  };
  await db.heroJourneyNotes.put(note);
}
