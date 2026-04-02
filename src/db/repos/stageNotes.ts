import type { StageNote } from "@/domain/models";
import type { StoryStage } from "@/domain/storyStage";
import { nowIso } from "@/domain/time";
import { db } from "../db";

function noteId(projectId: string, stage: StoryStage) {
  return `${projectId}:${stage}`;
}

/** Normalize stored note (legacy `text`-only or full beat list). */
export function stageNoteBeatState(note: StageNote): {
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

export async function getStageNote(
  projectId: string,
  stage: StoryStage,
): Promise<StageNote | undefined> {
  return db.stageNotes.get(noteId(projectId, stage));
}

export async function listStageNotes(projectId: string): Promise<StageNote[]> {
  return db.stageNotes.where("projectId").equals(projectId).toArray();
}

export async function upsertStageNote(input: {
  projectId: string;
  stage: StoryStage;
  beatOptions: string[];
  activeBeatIndex: number;
  cardX?: number | null;
  cardY?: number | null;
}): Promise<void> {
  const prev = await db.stageNotes.get(noteId(input.projectId, input.stage));
  let opts = [...input.beatOptions];
  if (opts.length === 0) opts = [""];
  const idx = Math.max(0, Math.min(opts.length - 1, input.activeBeatIndex));
  const text = opts[idx] ?? "";
  const note: StageNote = {
    id: noteId(input.projectId, input.stage),
    projectId: input.projectId,
    stage: input.stage,
    text,
    beatOptions: opts,
    activeBeatIndex: idx,
    cardX: input.cardX ?? prev?.cardX ?? null,
    cardY: input.cardY ?? prev?.cardY ?? null,
    updatedAt: nowIso(),
  };
  await db.stageNotes.put(note);
}

