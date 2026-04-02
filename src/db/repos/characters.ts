import type { Character } from "@/domain/models";
import { nowIso } from "@/domain/time";
import { db } from "@/db/db";
import { newId } from "@/db/ids";

export async function createCharacter(input: {
  projectId: string;
  name: string;
  role?: string;
  imageUrl?: string;
  logline?: string;
  bio?: string;
  goal?: string;
  flaw?: string;
}): Promise<Character> {
  const t = nowIso();
  const row: Character = {
    id: newId("chr"),
    projectId: input.projectId,
    name: input.name.trim() || "Sin nombre",
    role: (input.role ?? "").trim(),
    imageUrl: input.imageUrl,
    logline: (input.logline ?? "").trim(),
    bio: (input.bio ?? "").trim(),
    goal: (input.goal ?? "").trim(),
    flaw: (input.flaw ?? "").trim(),
    createdAt: t,
    updatedAt: t,
  };
  await db.characters.put(row);
  return row;
}

export async function listCharacters(projectId: string): Promise<Character[]> {
  return db.characters.where("projectId").equals(projectId).sortBy("updatedAt").then((x) => x.reverse());
}

export async function updateCharacter(
  id: string,
  patch: Partial<Pick<Character, "name" | "role" | "imageUrl" | "logline" | "bio" | "goal" | "flaw">>,
): Promise<void> {
  await db.characters.update(id, { ...patch, updatedAt: nowIso() });
}

export async function deleteCharacter(id: string): Promise<void> {
  await db.characters.delete(id);
}

