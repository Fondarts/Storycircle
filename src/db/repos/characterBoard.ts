import type { CharacterBoardNode, CharacterRelation } from "@/domain/models";
import { nowIso } from "@/domain/time";
import { db } from "@/db/db";
import { newId } from "@/db/ids";

export async function listCharacterBoardNodes(projectId: string): Promise<CharacterBoardNode[]> {
  const rows = await db.characterBoardNodes.where("projectId").equals(projectId).toArray();
  rows.sort((a, b) => a.zIndex - b.zIndex || a.updatedAt.localeCompare(b.updatedAt));
  return rows;
}

export async function upsertCharacterBoardNode(input: {
  projectId: string;
  characterId: string;
  x: number;
  y: number;
  zIndex?: number;
}): Promise<CharacterBoardNode> {
  const t = nowIso();
  const existing = await db.characterBoardNodes.where("[projectId+characterId]").equals([input.projectId, input.characterId]).first();
  const row: CharacterBoardNode = existing
    ? {
        ...existing,
        x: input.x,
        y: input.y,
        zIndex: input.zIndex ?? existing.zIndex,
        updatedAt: t,
      }
    : {
        id: newId("chn"),
        projectId: input.projectId,
        characterId: input.characterId,
        x: input.x,
        y: input.y,
        zIndex: input.zIndex ?? 1,
        createdAt: t,
        updatedAt: t,
      };
  await db.characterBoardNodes.put(row);
  return row;
}

export async function updateCharacterBoardNode(
  id: string,
  patch: Partial<Pick<CharacterBoardNode, "x" | "y" | "zIndex">>,
): Promise<void> {
  await db.characterBoardNodes.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteCharacterBoardNode(id: string): Promise<void> {
  await db.characterBoardNodes.delete(id);
}

export async function deleteCharacterBoardNodeByCharacterId(projectId: string, characterId: string): Promise<void> {
  const row = await db.characterBoardNodes
    .where("[projectId+characterId]")
    .equals([projectId, characterId])
    .first();
  if (!row) return;
  await db.characterBoardNodes.delete(row.id);
}

export async function nextCharacterBoardZIndex(projectId: string): Promise<number> {
  const rows = await db.characterBoardNodes.where("projectId").equals(projectId).toArray();
  const max = rows.reduce((m, r) => Math.max(m, r.zIndex), 0);
  return max + 1;
}

export async function listCharacterRelations(projectId: string): Promise<CharacterRelation[]> {
  const rows = await db.characterRelations.where("projectId").equals(projectId).toArray();
  rows.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  return rows;
}

export async function createCharacterRelation(input: {
  projectId: string;
  fromCharacterId: string;
  toCharacterId: string;
  label?: string;
  color?: string;
  dashed?: boolean;
  arrow?: boolean;
}): Promise<CharacterRelation> {
  const t = nowIso();
  const row: CharacterRelation = {
    id: newId("rel"),
    projectId: input.projectId,
    fromCharacterId: input.fromCharacterId,
    toCharacterId: input.toCharacterId,
    label: (input.label ?? "").trim(),
    color: input.color,
    dashed: input.dashed,
    arrow: input.arrow,
    createdAt: t,
    updatedAt: t,
  };
  await db.characterRelations.put(row);
  return row;
}

export async function updateCharacterRelation(
  id: string,
  patch: Partial<Pick<CharacterRelation, "label" | "color" | "dashed" | "arrow">>,
): Promise<void> {
  await db.characterRelations.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteCharacterRelation(id: string): Promise<void> {
  await db.characterRelations.delete(id);
}

export async function deleteRelationsByCharacterId(projectId: string, characterId: string): Promise<void> {
  await db.transaction("rw", db.characterRelations, async () => {
    await db.characterRelations.where("[projectId+fromCharacterId]").equals([projectId, characterId]).delete();
    await db.characterRelations.where("[projectId+toCharacterId]").equals([projectId, characterId]).delete();
  });
}

