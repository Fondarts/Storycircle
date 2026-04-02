import type { MoodboardItem } from "@/domain/models";
import { db } from "@/db/db";
import { newId } from "@/db/ids";

function normalizeMoodboardRow(r: MoodboardItem): MoodboardItem {
  const scale =
    typeof r.scale === "number" && Number.isFinite(r.scale) ? Math.min(8, Math.max(0.05, r.scale)) : 1;
  const rotationDeg =
    typeof r.rotationDeg === "number" && Number.isFinite(r.rotationDeg) ? r.rotationDeg : 0;
  return {
    ...r,
    strokeColor: r.strokeColor ?? "",
    strokeWidth: typeof r.strokeWidth === "number" && r.strokeWidth > 0 ? r.strokeWidth : 2,
    rotationDeg,
    scale,
    locked: r.locked === true,
  };
}

export async function listMoodboardItems(projectId: string): Promise<MoodboardItem[]> {
  const rows = await db.moodboardItems.where("projectId").equals(projectId).toArray();
  rows.sort((a, b) => a.zIndex - b.zIndex || a.createdAt.localeCompare(b.createdAt));
  return rows.map(normalizeMoodboardRow);
}

export async function createMoodboardItem(
  input: Omit<MoodboardItem, "id" | "createdAt" | "updatedAt">,
): Promise<MoodboardItem> {
  const now = new Date().toISOString();
  const row: MoodboardItem = normalizeMoodboardRow({
    ...input,
    strokeColor: input.strokeColor ?? "",
    strokeWidth: input.strokeWidth ?? 2,
    id: newId("mb"),
    createdAt: now,
    updatedAt: now,
  });
  await db.moodboardItems.put(row);
  return row;
}

export async function updateMoodboardItem(
  id: string,
  patch: Partial<Omit<MoodboardItem, "id" | "createdAt">>,
): Promise<void> {
  const prev = await db.moodboardItems.get(id);
  if (!prev) return;
  const next: MoodboardItem = normalizeMoodboardRow({
    ...prev,
    ...patch,
    id: prev.id,
    projectId: prev.projectId,
    createdAt: prev.createdAt,
    updatedAt: new Date().toISOString(),
  });
  await db.moodboardItems.put(next);
}

export async function deleteMoodboardItem(id: string): Promise<void> {
  await db.moodboardItems.delete(id);
}

/** Next z-index above all items in project (bring-to-front helper). */
export async function nextMoodboardZIndex(projectId: string): Promise<number> {
  const rows = await db.moodboardItems.where("projectId").equals(projectId).toArray();
  const max = rows.reduce((m, r) => Math.max(m, r.zIndex), 0);
  return max + 1;
}
