import type { Project } from "@/domain/models";
import { nowIso } from "@/domain/time";
import { db } from "../db";
import { newId } from "../ids";

export async function createProject(input: {
  title: string;
  logline?: string;
  synopsis?: string;
}): Promise<Project> {
  const t = nowIso();
  const project: Project = {
    id: newId("proj"),
    title: input.title.trim() || "Untitled project",
    logline: (input.logline ?? "").trim(),
    synopsis: (input.synopsis ?? "").trim(),
    createdAt: t,
    updatedAt: t,
  };
  await db.projects.add(project);
  return project;
}

export async function updateProject(
  projectId: string,
  patch: Partial<Pick<Project, "title" | "logline" | "synopsis">>,
): Promise<void> {
  const updatedAt = nowIso();
  await db.projects.update(projectId, {
    ...patch,
    updatedAt,
  });
}

export async function getProject(projectId: string): Promise<Project | undefined> {
  const p = await db.projects.get(projectId);
  if (!p) return undefined;
  return { ...p, synopsis: p.synopsis ?? "" };
}

export async function listProjects(): Promise<Project[]> {
  const rows = await db.projects.orderBy("updatedAt").reverse().toArray();
  return rows.map((p) => ({ ...p, synopsis: p.synopsis ?? "" }));
}

