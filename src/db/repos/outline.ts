import type { Scene, Sequence } from "@/domain/models";
import { nowIso } from "@/domain/time";
import { db } from "../db";
import { newId } from "../ids";

function normalizeScene(s: Scene): Scene {
  return {
    ...s,
    boardX: s.boardX ?? null,
    boardY: s.boardY ?? null,
  };
}

export async function listSequences(projectId: string): Promise<Sequence[]> {
  return db.sequences.where("projectId").equals(projectId).sortBy("order");
}

export async function createSequence(input: {
  projectId: string;
  title: string;
}): Promise<Sequence> {
  const t = nowIso();
  const sequences = await listSequences(input.projectId);
  const seq: Sequence = {
    id: newId("seq"),
    projectId: input.projectId,
    title: input.title.trim() || "Sequence",
    order: sequences.length,
    createdAt: t,
    updatedAt: t,
  };
  await db.sequences.add(seq);
  return seq;
}

export async function updateSequence(
  sequenceId: string,
  patch: Partial<Pick<Sequence, "title" | "order">>,
): Promise<void> {
  await db.sequences.update(sequenceId, { ...patch, updatedAt: nowIso() });
}

export async function deleteSequence(sequenceId: string): Promise<void> {
  await db.transaction("rw", db.sequences, db.scenes, async () => {
    await db.sequences.delete(sequenceId);
    await db.scenes.where("sequenceId").equals(sequenceId).delete();
  });
}

export async function listScenesForProject(projectId: string): Promise<Scene[]> {
  const rows = await db.scenes.where("projectId").equals(projectId).toArray();
  return rows.map((s) => normalizeScene(s));
}

export async function listScenesForSequence(sequenceId: string): Promise<Scene[]> {
  const rows = await db.scenes.where("sequenceId").equals(sequenceId).sortBy("order");
  return rows.map((s) => normalizeScene(s));
}

export async function createScene(input: {
  projectId: string;
  /** Omit or "" to place on free board. */
  sequenceId?: string;
  title: string;
  summary?: string;
  sourceEventIds?: string[];
  estMinutes?: number | null;
  boardX?: number;
  boardY?: number;
}): Promise<Scene> {
  const t = nowIso();
  const sequenceId = input.sequenceId ?? "";
  const scenes = await listScenesForSequence(sequenceId);
  const onBoard = sequenceId === "";
  const scene: Scene = {
    id: newId("scn"),
    projectId: input.projectId,
    sequenceId,
    boardX: onBoard ? (input.boardX ?? 32 + (scenes.length % 6) * 32) : null,
    boardY: onBoard ? (input.boardY ?? 32 + Math.floor(scenes.length / 6) * 160) : null,
    title: input.title.trim() || "Scene",
    summary: (input.summary ?? "").trim(),
    sourceEventIds: input.sourceEventIds ?? [],
    estMinutes: input.estMinutes ?? null,
    order: scenes.length,
    createdAt: t,
    updatedAt: t,
  };
  await db.scenes.add(scene);
  return scene;
}

export async function updateScene(
  sceneId: string,
  patch: Partial<
    Pick<
      Scene,
      | "title"
      | "summary"
      | "sourceEventIds"
      | "estMinutes"
      | "order"
      | "sequenceId"
      | "boardX"
      | "boardY"
    >
  >,
): Promise<void> {
  await db.scenes.update(sceneId, { ...patch, updatedAt: nowIso() });
}

export async function deleteScene(sceneId: string): Promise<void> {
  await db.scenes.delete(sceneId);
}

